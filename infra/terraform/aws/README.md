# AWS Terraform Root

This root manages AWS resources for CmdClaw.

Current resources:

- S3 bucket for documents

## Commands

```bash
cd infra/terraform/aws
cp terraform.tfvars.example terraform.tfvars
tofu init
tofu plan
tofu apply
```

## Variables

- `aws_region`: AWS region, defaults to `us-east-1`
- `environment`: environment name, defaults to `production`
- `bucket_name`: S3 bucket name

## Notes

- Run `tofu fmt` after edits.
- This root should have its own state.
