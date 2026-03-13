# PostHog Terraform Root

This root is for PostHog resources managed through the `PostHog/posthog` provider.

Current status:

- provider scaffolding is in place
- PostHog resources still need to be added

## Commands

```bash
cd infra/terraform/posthog
cp terraform.tfvars.example terraform.tfvars
cp .env.example .env
source .env
tofu init
tofu plan
tofu apply
```

OpenTofu does not read `.env` automatically. `source .env` loads the variables into your current shell before running `tofu`.

The provider can read these directly from the shell:

- `POSTHOG_API_KEY`
- `POSTHOG_HOST`
- `POSTHOG_ORGANIZATION_ID`
- `POSTHOG_PROJECT_ID`

## Variables

- `posthog_host`: PostHog API host, or leave unset and use `POSTHOG_HOST`
- `posthog_organization_id`: PostHog organization ID
- `posthog_project_id`: PostHog project ID
- `posthog_api_key`: PostHog personal API key

## Notes

- This root should have its own state.
- If you already have a PostHog project, import or reference it before adding more resources.
- Keep secrets in `.env` or another shell-based secret loader, not in committed files.
