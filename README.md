# Webflow + Pipedrive Integration

This project provides a complete integration between Webflow forms and Pipedrive CRM using Hono backend deployed on Vercel Edge Functions. It automatically processes form submissions, validates them with reCAPTCHA, stores them in Supabase, and creates/updates contacts and leads in Pipedrive.

## Features

- **Form Processing**: Automatic handling of Webflow form submissions
- **Pipedrive Integration**: Creates contacts and leads in your Pipedrive CRM
- **reCAPTCHA Protection**: Spam prevention with Google reCAPTCHA validation
- **Database Backup**: Stores all submissions in Supabase for backup and analytics
- **Smart Contact Management**: Handles existing contacts and creates new ones as needed
- **Lead Tracking**: Automatically creates leads and adds detailed notes
- **TypeScript**: Full type safety with comprehensive error handling
- **Edge Functions**: Fast, serverless processing with Vercel Edge Functions
- **Flexible Deployment**: Can be deployed to Vercel, Cloudflare, or Netlify

## Getting Started

### Prerequisites

1. **Pipedrive Account** - You'll need API access to your Pipedrive account
2. **Supabase Project** - For storing form submissions
3. **Google reCAPTCHA** - For spam protection
4. **Webflow Site** - Where your forms are hosted

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo>
   cd wf-pipedrive
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env.local` file:
   ```env
   # Pipedrive Configuration
   PIPEDRIVE_API_KEY=your_pipedrive_api_key
   PIPEDRIVE_BASE_URL=https://yourcompany.pipedrive.com/api/v1
   
   # Supabase Configuration
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # reCAPTCHA Configuration
   RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
   
   # Frontend
   VITE_API_URL=http://localhost:5173
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

## Project Structure

```
├── api/
│   ├── [[...route]].ts           # Main API handler
│   ├── lib/
│   │   ├── pipedrive.ts          # Pipedrive API functions
│   │   ├── recaptcha.ts          # reCAPTCHA validation
│   │   └── supabase.ts           # Supabase client
│   └── routes/
│       └── form-submission.ts    # Form processing logic
├── src/
│   ├── main.ts                   # Frontend entry point
│   ├── components/
│   │   └── contact.ts            # Contact form handling
│   └── utils/
│       ├── middleware.ts         # Request middleware
│       └── recaptcha.ts          # Frontend reCAPTCHA
├── vite.config.ts                # Vite configuration
├── vercel.json                   # Vercel deployment config
└── package.json
```

## Configuration

### Pipedrive Setup

1. **Get your API key:**
   - Go to Pipedrive Settings → Personal Preferences → API
   - Copy your API token

2. **Find your base URL:**
   - Your Pipedrive URL: `https://yourcompany.pipedrive.com/api/v1`

3. **Configure owner ID:**
   - Update the `owner_id` in `api/routes/form-submission.ts` (currently set to `23676555`)
   - Find your user ID in Pipedrive settings

### Supabase Setup

1. **Create a table for form submissions:**
   ```sql
   CREATE TABLE form_submissions (
     id SERIAL PRIMARY KEY,
     data JSONB NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Enable RLS on the form_submissions table
   ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
   
   -- Create a policy that allows service role to insert data
   -- This policy allows the service role (used by your API) to insert form submissions
   CREATE POLICY "Service role can insert form submissions" ON form_submissions
     FOR INSERT TO service_role
     WITH CHECK (true);
   
   -- Create a policy that allows service role to read all data
   -- This policy allows the service role to read form submissions for analytics/backup
   CREATE POLICY "Service role can read form submissions" ON form_submissions
     FOR SELECT TO service_role
     USING (true);
   
   -- Optional: Create a policy for authenticated users to read their own submissions
   -- This would require user authentication and a user_id column
   -- CREATE POLICY "Users can read own submissions" ON form_submissions
   --   FOR SELECT TO authenticated
   --   USING (auth.uid() = user_id);
   ```

2. **Get your project credentials:**
   - Project URL from Supabase dashboard
   - Service role key (for server-side operations)

### reCAPTCHA Setup

1. **Create a reCAPTCHA site:**
   - Go to [Google reCAPTCHA](https://www.google.com/recaptcha/)
   - Create a new site (v2 checkbox recommended)
   - Get your site key and secret key

## Adding to Webflow

Add this script to your Webflow project in **Settings > Custom Code > Footer Code**:

```html
<script>
  (function () {
    const CONFIG = {
      localhost: 'http://localhost:5173',
      staging: 'https://your-project-staging.vercel.app', 
      production: 'https://your-project.vercel.app'
    };

    const PATHS = {
      localhost: ['@vite/client', 'src/main.ts'],
      build: ['/main.js']
    };

    function loadScripts(urls) {
      urls.forEach(url => {
        const script = document.createElement('script');
        script.src = url;
        script.type = "module";
        script.onerror = () => console.error('Failed to load:', url);
        document.body.appendChild(script);
      });
    }

    function init() {
      // Try localhost first
      fetch(`${CONFIG.localhost}/${PATHS.localhost[0]}`, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          // Localhost available
          console.log('🚀 Development mode');
          const urls = PATHS.localhost.map(path => `${CONFIG.localhost}/${path}`);
          loadScripts(urls);
        })
        .catch(() => {
          // Use staging or production
          const isStaging = window.location.href.includes('.webflow.io');
          const domain = isStaging ? CONFIG.staging : CONFIG.production;
          const env = isStaging ? 'staging' : 'production';
          
          console.log(`🌐 ${env.charAt(0).toUpperCase() + env.slice(1)} mode`);
          const urls = PATHS.build.map(path => domain + path);
          loadScripts(urls);
        });
    }

    // Start when ready
    document.readyState === 'loading' 
      ? document.addEventListener('DOMContentLoaded', init)
      : init();
  })();
</script>
```

### Form Setup in Webflow

1. **Add form fields with these exact names:**
   - `Email` (required)
   - `First-Name`
   - `Last-Name`
   - `Phone-Number`
   - `Job-Title`
   - `Company`
   - `Message`

2. **Add reCAPTCHA:**
   - Add a reCAPTCHA element to your form
   - Configure with your site key

3. **Set form action:**
   - Point your form to: `https://your-domain.vercel.app/api/form-submission?form=contact-form&source=website`
   - Customize the `form` and `source` parameters as needed

## 📊 API Endpoints

### Form Submission
```
POST /api/form-submission?form=<form-name>&source=<source>
```

**Expected form fields:**
- `Email` (required)
- `First-Name`
- `Last-Name`
- `Phone-Number`
- `Job-Title`
- `Company`
- `Message`
- `g-recaptcha-response` (reCAPTCHA token)

**Response:**
```json
{
  "data": null,
  "error": null,
  "status": 200,
  "recaptcha_result": "success"
}
```

## 🚀 Deployment

### Vercel (Recommended)

1. **Build and deploy:**
   ```bash
   npm run build
   vercel --prod
   ```

2. **Set environment variables in Vercel dashboard:**
   - All the variables from your `.env.local` file
   - Remove `VITE_API_URL` or set it to your production domain

### Alternative Deployments

This project can also be deployed to:
- **Cloudflare Pages** - Modify `vercel.json` to `_headers` and `_redirects`
- **Netlify** - Use Netlify Functions instead of Vercel Edge Functions
- **Any Node.js hosting** - The Hono app can run on traditional servers

## How It Works

1. **User submits form** on your Webflow site
2. **reCAPTCHA validation** prevents spam submissions
3. **Form data is processed** and validated on the server
4. **Submission is stored** in Supabase for backup
5. **Person lookup** in Pipedrive by email
6. **Person creation** if they don't exist
7. **Lead creation** or update for the person
8. **Note addition** with form submission details
9. **Success response** sent back to Webflow

## Customization

### Adding Custom Fields

To add custom Pipedrive fields, uncomment and modify the example in `api/routes/form-submission.ts`:

```typescript
custom_fields: [
    {
        key: "your_custom_field_key", // Find this in Pipedrive settings
        value: data["Job-Title"] ?? "",
    },
],
```

### Different Form Types

You can handle multiple form types by using different `form` parameter values:
- `/api/form-submission?form=contact&source=homepage`
- `/api/form-submission?form=newsletter&source=blog`
- `/api/form-submission?form=demo&source=pricing`

## Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run start` - Start Vercel development environment
- `npm run typecheck` - Run TypeScript type checking

## Troubleshooting

### Common Issues

1. **reCAPTCHA fails**: Check your secret key and ensure the site key matches
2. **Pipedrive API errors**: Verify your API key and base URL
3. **Supabase connection issues**: Check your URL and service role key
4. **CORS errors**: Ensure your domains are properly configured

### Debugging

Enable debug logging by adding `console.log` statements in the form submission handler. Check your Vercel function logs for detailed error information.

## Learn More

- [Pipedrive API Documentation](https://developers.pipedrive.com/docs/api/v1)
- [Hono Documentation](https://hono.dev/)
- [Vercel Edge Functions](https://vercel.com/docs/concepts/functions/edge-functions)
- [Webflow Forms](https://university.webflow.com/lesson/forms)

## Contributing

Feel free to submit issues and enhancement requests! This is a template that can be adapted for various CRM integrations.