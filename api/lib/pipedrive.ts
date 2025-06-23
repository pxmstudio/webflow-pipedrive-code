export const findPersonByEmail = async ({
    email,
}: {
    email: string;
}) => {
    const url = new URL(`${process.env.PIPEDRIVE_BASE_URL}/persons/search`);
    const params = new URLSearchParams({
        term: encodeURI(email),
        fields: "email",
        exact_match: "true",
        start: "0",
        limit: "1",
    });

    url.search = params.toString();

    const res = await fetch(url.toString(), {
        headers: {
            "x-api-token": process.env.PIPEDRIVE_API_KEY,
        },
    });

    return res.json();
};

type Person = {
    name: string;
    owner_id: number;
    org_id?: number;
    email?: {
        value: string;
        primary: boolean;
        label: string;
    }[];
    phone?: {
        value: string;
        primary: boolean;
        label: string;
    }[];
    label?: number;
    label_ids?: number[];
    visible_to?: number;
    marketing_status?:
    | "no_consent"
    | "unsubscribed"
    | "subscribed"
    | "archived";
    add_time?: string;
    custom_fields?: {
        key: string;
        value: any;
    }[];
    [key: string]: any;
};

type Lead = {
    title: string;
    owner_id?: number;
    label_ids?: number[];
    person_id: number;
    organization_id?: number;
    value?: {
        amount: number;
        currency: string;
    };
    expected_close_date?: string;
    visible_to?: string;
    origin_id?: string;
    channel?: number;
    channel_id?: number;
};

export const addPerson = async ({ data }: { data: Person }) => {
    const url = new URL(`${process.env.PIPEDRIVE_BASE_URL}/persons`);

    const reqDataObj = {} as Person;

    if (data.name) reqDataObj.name = data.name;
    if (data.owner_id) reqDataObj.owner_id = data.owner_id;
    if (data.org_id) reqDataObj.org_id = data.org_id;
    if (data.email) reqDataObj.email = data.email;
    if (data.phone) reqDataObj.phone = data.phone;
    if (data.label) reqDataObj.label = data.label;
    if (data.label_ids) reqDataObj.label_ids = data.label_ids;
    if (data.visible_to) reqDataObj.visible_to = data.visible_to;
    if (data.marketing_status) {
        reqDataObj.marketing_status = data.marketing_status;
    }
    if (data.add_time) reqDataObj.add_time = data.add_time;
    if (data.custom_fields) {
        data.custom_fields.forEach((field) => {
            reqDataObj[field.key] = field.value;
        });
    }

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "x-api-token": process.env.PIPEDRIVE_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(reqDataObj),
    });

    return res.json();
};

export const createLead = async (data: Lead) => {
    const url = new URL(`${process.env.PIPEDRIVE_BASE_URL}/leads`);

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "x-api-token": process.env.PIPEDRIVE_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    return res.json();
};

export const findLeadByPersonId = async (
    personId: number,
    personName: string,
) => {
    const url = new URL(`${process.env.PIPEDRIVE_BASE_URL}/leads/search`);
    const params = new URLSearchParams({
        term: personName,
        fields: "title",
        exact_match: "true",
        start: "0",
        limit: "1",
        person_id: personId.toString(),
    });

    url.search = params.toString();
    const res = await fetch(url.toString(), {
        headers: {
            "x-api-token": process.env.PIPEDRIVE_API_KEY,
        },
    });

    return res.json() as Record<string, any> as {
        success: boolean;
        data: {
            items: Lead[];
        };
    };
};

export const getLead = async (
    data: { title: string; person_id: number },
) => {
    // First try to find an existing lead for this person
    const existingLead = await findLeadByPersonId(
        data.person_id,
        data.title,
    );

    // If a lead exists, return it
    if (existingLead.success && existingLead.data.items.length > 0) {
        return existingLead;
    }

    // Otherwise create a new lead
    const newLead = await createLead({
        title: data.title,
        person_id: data.person_id,
        visible_to: "3",
    });

    return newLead;
};

export const getLeadById = async (leadId: string) => {
    const url = new URL(`${process.env.PIPEDRIVE_BASE_URL}/leads/${leadId}`);
    const res = await fetch(url, {
        headers: {
            "x-api-token": process.env.PIPEDRIVE_API_KEY,
        },
    });

    return res.json();
};

export const addNoteToLeadAndPerson = async (
    leadId: string,
    personId: number,
    note: string,
) => {
    try {
        const url = new URL(`${process.env.PIPEDRIVE_BASE_URL}/notes`);

        const now = new Date();
        const addTime = `${now.getFullYear()}-${now.getMonth() + 1
            }-${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

        await fetch(url, {
            method: "POST",
            headers: {
                "x-api-token": process.env.PIPEDRIVE_API_KEY,
                "Content-type": "application/json",
            },
            body: JSON.stringify({
                content: note,
                lead_id: leadId,
                person_id: personId,
                add_time: addTime,
            }),
        });
    } catch (error) {
        console.error(`Error adding note to lead and person. ${error}`);
    }
};
