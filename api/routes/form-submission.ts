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
    [key: string]: string | undefined;
    form: string;
    source: string;
}

// Standardized field names for Pipedrive
interface StandardizedFields {
    email: string;
    fullName: string;
    phone?: string;
    jobTitle?: string;
    company?: string;
    message?: string;
}

// Field mapping configuration - Users customize this based on their form structure
interface FieldMapping {
    email: string;
    fullName: string | string[]; // Can be single field or array for first/last name
    phone?: string;
    jobTitle?: string;
    company?: string;
    message?: string;
}

// CONFIGURATION: Add your form field mappings here
// Users should modify this object to match their form field names
// 
// How to use:
// 1. Add a new entry with your form name as the key
// 2. Map each standardized field to your actual form field name(s)
// 3. For fullName, you can use either a single field name or an array for first/last name
// 4. Optional fields can be omitted if your form doesn't have them
//
// Example form HTML:
// <input name="work_email" type="email" required>
// <input name="full_name" type="text" required>
// <input name="contact_number" type="tel">
// <input name="position" type="text">
// <input name="organization" type="text">
// <textarea name="requirements"></textarea>
//
// Corresponding mapping:
// demo: {
//     email: "work_email",
//     fullName: "full_name", 
//     phone: "contact_number",
//     jobTitle: "position",
//     company: "organization",
//     message: "requirements"
// }
const FORM_FIELD_MAPPINGS: Record<string, FieldMapping> = {
    // Example: Contact form
    contact: {
        email: "Email",
        fullName: "name",
        phone: "Phone-Number",
        jobTitle: "Job-Title",
        company: "Company",
        message: "Message"
    },

    // Example: Newsletter signup form with separate first/last name fields
    newsletter: {
        email: "Email",
        fullName: ["First-Name", "Last-Name"], // Will be combined,
        company: "Company"
    },
};

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

        const { rawData, standardized } = await processFormSubmission(formData, formName, formSource);

        // Store the submission in our database for backup/tracking
        await storeSubmissionInDatabase(rawData);

        // Send the submission to Pipedrive CRM
        await sendSubmissionToPipedrive(standardized, formName, formSource);

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
    const source = url.searchParams.get("source") || "Unknown";
    const form = url.searchParams.get("form");

    return {
        formName: form || source, // Use source as form name if no explicit form parameter
        formSource: source
    };
}

/**
 * Standardizes form data using the configured field mappings
 */
function standardizeFormData(formData: FormData, formName: string): StandardizedFields {
    const mapping = FORM_FIELD_MAPPINGS[formName];

    if (!mapping) {
        throw new Error(`No field mapping found for form: ${formName}. Please add mapping to FORM_FIELD_MAPPINGS.`);
    }

    // Extract email (required)
    const email = formData.get(mapping.email) as string;
    if (!email?.trim()) {
        throw new Error(`Email field '${mapping.email}' is required but not found or empty.`);
    }

    // Extract full name (required) - handle both single field and first/last name combination
    let fullName = "";
    if (Array.isArray(mapping.fullName)) {
        // Combine first and last name
        const names = mapping.fullName
            .map(fieldName => formData.get(fieldName) as string)
            .filter(name => name?.trim())
            .map(name => name.trim());
        fullName = names.join(" ");
    } else {
        // Single name field
        fullName = (formData.get(mapping.fullName) as string)?.trim() || "";
    }

    if (!fullName) {
        const fieldNames = Array.isArray(mapping.fullName) ? mapping.fullName.join(", ") : mapping.fullName;
        throw new Error(`Name field(s) '${fieldNames}' are required but not found or empty.`);
    }

    // Extract optional fields
    const standardized: StandardizedFields = {
        email: email.trim(),
        fullName: fullName
    };

    if (mapping.phone) {
        const phone = formData.get(mapping.phone) as string;
        if (phone?.trim()) {
            standardized.phone = phone.trim();
        }
    }

    if (mapping.jobTitle) {
        const jobTitle = formData.get(mapping.jobTitle) as string;
        if (jobTitle?.trim()) {
            standardized.jobTitle = jobTitle.trim();
        }
    }

    if (mapping.company) {
        const company = formData.get(mapping.company) as string;
        if (company?.trim()) {
            standardized.company = company.trim();
        }
    }

    if (mapping.message) {
        const message = formData.get(mapping.message) as string;
        if (message?.trim()) {
            standardized.message = message.trim();
        }
    }

    return standardized;
}

/**
 * Processes the form submission data including reCAPTCHA validation
 */
async function processFormSubmission(
    formData: FormData,
    formName: string,
    formSource: string
): Promise<{ rawData: FormSubmissionData; standardized: StandardizedFields }> {
    // Validate reCAPTCHA first to prevent spam
    const recaptchaToken = formData.get("g-recaptcha-response") as string;
    const captchaResponse = await validateCaptcha(recaptchaToken);

    if (captchaResponse.status !== 200) {
        throw new Error(`reCAPTCHA validation failed: ${JSON.stringify(captchaResponse)}`);
    }

    // Standardize the form data using field mappings
    const standardized = standardizeFormData(formData, formName);

    // Create raw data object for storage (preserves original field names)
    const rawData: FormSubmissionData = {
        form: formName,
        source: formSource
    };

    // Store all form fields as they were submitted (for backup/debugging)
    formData.forEach((value, key) => {
        if (key !== "g-recaptcha-response" && typeof value === "string" && value.trim()) {
            rawData[key] = value.trim();
        }
    });

    return { rawData, standardized };
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
async function sendSubmissionToPipedrive(
    data: StandardizedFields,
    formName: string,
    formSource: string
): Promise<void> {
    try {
        const email = data.email;

        // Check if person already exists in Pipedrive
        const existingPerson = await findExistingPerson(email);

        // Get or create the person in Pipedrive
        const person = existingPerson || await createNewPerson(data);

        // Create a lead for this person if needed
        const lead = await getOrCreateLead(person);

        // Add a note with the form submission details
        await addSubmissionNote(lead.id, person.id, data, formName, formSource);

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
async function createNewPerson(data: StandardizedFields): Promise<any> {
    const fullName = data.fullName.trim();

    if (!fullName) {
        throw new Error("Person name is required to create Pipedrive entry");
    }

    const personData = {
        name: fullName,
        email: [{
            value: data.email,
            primary: true,
            label: "work",
        }],
        phone: data.phone ? [{
            value: data.phone,
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
function formatSubmissionNote(data: StandardizedFields, formName: string, formSource: string): string {
    // Create formatted note with standardized fields
    const noteFields = Object.entries(data)
        .map(([key, value]) => `<span><strong>${key}:</strong> ${value}</span>`)
        .join("<br>");

    return `
        <b>Form Submission - Source: ${formName}</b><br>
        <i>Submitted from: ${formSource}</i><br><br>
        ${noteFields}
    `;
}

/**
 * Adds a note to both the lead and person in Pipedrive
 */
async function addSubmissionNote(leadId: number, personId: number, data: StandardizedFields, formName: string, formSource: string): Promise<void> {
    const note = formatSubmissionNote(data, formName, formSource);

    await addNoteToLeadAndPerson(leadId.toString(), personId, note);
}
