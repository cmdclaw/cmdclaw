# Terraform

This folder contains separate OpenTofu/Terraform root modules.

- `aws/` manages AWS infrastructure.
- `posthog/` manages PostHog resources.

Each folder has its own state and should be planned/applied separately.

## Common commands

Run commands from the root you want to manage:

```bash
cd infra/terraform/aws
tofu init
tofu plan
tofu apply
```

```bash
cd infra/terraform/posthog
tofu init
tofu plan
tofu apply
```

## Variables

Each root includes a `terraform.tfvars.example`.

Typical setup:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Do not commit `terraform.tfvars` or `.tfstate` files.
