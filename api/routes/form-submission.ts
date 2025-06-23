import type { Context } from "hono";
import { validateCaptcha } from "../lib/recaptcha";
import {
    addNoteToLeadAndPerson,
    addPerson,
    findPersonByEmail,
    getLead,
} from "../lib/pipedrive";
import { supabase } from "../lib/supabase";

// Type definitions for better code clarity and type safety
interface FormSubmissionData {
    Email?: string;
    "First-Name"?: string;
    "Last-Name"?: string;
    "Phone-Number"?: string;
    "Job-Title"?: string;
    Company?: string;
    Message?: string;
    form: string;
    source: string;
}

interface PipedrivePersonResponse {
    data: {
        items: Array<{
            item: {
                id: number;
                name: string;
                phones: string[];
                emails: string[];
                primary_email: string;
                visible_to: number;
                owner: { id: number };
                organization?: string;
                custom_fields: object[];
                notes: string[];
                update_time: string;
            };
        }>;
    };
    additional_data: {
        pagination: {
            start: number;
            limit: number;
            more_items_in_collection: boolean;
        };
    };
}

interface ApiResponse {
    data: any;
    error: any;
    status: number;
    recaptcha_result?: string;
}

/**
 * Main handler for form submissions
 * Processes form data, validates reCAPTCHA, stores in database, and sends to Pipedrive
 */
export async function formSubmission(c: Context): Promise<Response> {
    try {
        // Extract query parameters for form identification
        const { formName, formSource } = extractUrlParams(c);

        // Parse and validate the form data
        const formData = await c.req.formData();
        const submissionData = await processFormSubmission(formData, formName, formSource);

        // Store the submission in our database for backup/tracking
        await storeSubmissionInDatabase(submissionData);

        // Send the submission to Pipedrive CRM
        await sendSubmissionToPipedrive(c, submissionData);

        // Return success response
        return c.json({
            data: null,
            error: null,
            status: 200,
            recaptcha_result: "success",
        } as ApiResponse, 200);

    } catch (error) {
        console.error("Form submission failed:", error);
        return c.json({
            data: null,
            error: error instanceof Error ? error.message : "Unknown error occurred",
            status: 500,
        } as ApiResponse, 500);
    }
}

/**
 * Extracts form name and source from URL parameters
 */
function extractUrlParams(c: Context): { formName: string; formSource: string } {
    const url = new URL(c.req.url);
    return {
        formName: url.searchParams.get("form") || "Unknown",
        formSource: url.searchParams.get("source") || "Unknown"
    };
}

/**
 * Processes the form submission data including reCAPTCHA validation
 */
async function processFormSubmission(
    formData: FormData,
    formName: string,
    formSource: string
): Promise<FormSubmissionData> {
    // Validate reCAPTCHA first to prevent spam
    const recaptchaToken = formData.get("g-recaptcha-response") as string;
    const captchaResponse = await validateCaptcha(recaptchaToken);

    if (captchaResponse.status !== 200) {
        throw new Error(`reCAPTCHA validation failed: ${JSON.stringify(captchaResponse)}`);
    }

    // Extract and clean form fields
    const submissionData: FormSubmissionData = {
        form: formName,
        source: formSource
    };

    // Define expected form fields for easier maintenance
    const formFields = [
        "Email", "First-Name", "Last-Name",
        "Phone-Number", "Job-Title", "Company", "Message"
    ] as const;

    // Extract only non-empty form fields
    formFields.forEach(field => {
        const value = formData.get(field) as string;
        if (value?.trim()) {
            submissionData[field] = value.trim();
        }
    });

    // Validate required fields
    if (!submissionData.Email) {
        throw new Error("Email is required for form submission");
    }

    return submissionData;
}

/**
 * Stores the form submission in our Supabase database for backup and tracking
 */
async function storeSubmissionInDatabase(data: FormSubmissionData): Promise<void> {
    const { error } = await supabase
        .from("form_submissions")
        .insert({
            data: JSON.stringify(data),
        });

    if (error) {
        console.error("Failed to store submission in database:", error);
        throw new Error("Database storage failed");
    }
}

/**
 * Sends the form submission to Pipedrive CRM
 * Handles person creation/lookup and lead management
 */
export async function sendSubmissionToPipedrive(
    c: Context,
    data: FormSubmissionData,
): Promise<Response> {
    try {
        const email = data.Email!; // We've already validated this exists

        // Check if person already exists in Pipedrive
        const existingPerson = await findExistingPerson(email);

        // Get or create the person in Pipedrive
        const person = existingPerson || await createNewPerson(data);

        // Create a lead for this person if needed
        const lead = await getOrCreateLead(person);

        // Add a note with the form submission details
        await addSubmissionNote(lead.id, person.id, data);

        return c.json({
            existingPerson: JSON.stringify(person)
        }, 200);

    } catch (error) {
        console.error("Failed to send submission to Pipedrive:", error);
        throw error; // Re-throw to be handled by main handler
    }
}

/**
 * Finds an existing person in Pipedrive by email
 */
async function findExistingPerson(email: string): Promise<any | null> {
    const response = await findPersonByEmail({ email }) as PipedrivePersonResponse;

    if (response.data.items.length > 0) {
        return response.data.items[0].item;
    }

    return null;
}

/**
 * Creates a new person in Pipedrive with the form submission data
 */
async function createNewPerson(data: FormSubmissionData): Promise<any> {
    const fullName = `${data["First-Name"] || ""} ${data["Last-Name"] || ""}`.trim();

    if (!fullName) {
        throw new Error("Person name is required to create Pipedrive entry");
    }

    const personData = {
        name: fullName,
        email: [{
            value: data.Email!,
            primary: true,
            label: "work",
        }],
        phone: data["Phone-Number"] ? [{
            value: data["Phone-Number"],
            primary: true,
            label: "mobile",
        }] : [],
        // Example: How to add custom fields to a person
        // custom_fields: [
        //     {
        //         key: "009901ebadbc964335540477075dc99d990f78c5", // Custom job title field key
        //         value: data["Job-Title"] ?? "",
        //     },
        // ],
        owner_id: 23676555, // TODO: Make this configurable
        visible_to: 3, // TODO: Make this configurable
    };

    const newPersonResponse = await addPerson({ data: personData });

    if (!newPersonResponse.data) {
        throw new Error("Failed to create person in Pipedrive");
    }

    return newPersonResponse.data;
}

/**
 * Gets an existing lead or creates a new one for the person
 */
async function getOrCreateLead(person: any): Promise<{ id: number }> {
    const leadResponse = await getLead({
        title: person.name,
        person_id: person.id,
    });

    // Extract lead ID from response (handles both new and existing leads)
    const leadId = leadResponse.data?.id || leadResponse.data?.items?.[0]?.item?.id;

    if (!leadId) {
        throw new Error("Failed to get or create lead in Pipedrive");
    }

    return { id: leadId };
}

/**
 * Creates a formatted note with the form submission details
 */
function formatSubmissionNote(data: FormSubmissionData): string {
    // Filter out metadata fields and create formatted note
    const noteFields = Object.entries(data)
        .filter(([key]) => !["form", "source"].includes(key))
        .map(([key, value]) => `<span><strong>${key}:</strong> ${value}</span>`)
        .join("<br>");

    return `
        <b>Form Submission - Source: ${data.form}</b><br>
        <i>Submitted from: ${data.source}</i><br><br>
        ${noteFields}
    `;
}

/**
 * Adds a note to both the lead and person in Pipedrive
 */
async function addSubmissionNote(leadId: number, personId: number, data: FormSubmissionData): Promise<void> {
    const note = formatSubmissionNote(data);

    await addNoteToLeadAndPerson(leadId.toString(), personId, note);
}
