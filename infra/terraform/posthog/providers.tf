provider "posthog" {
  api_key         = var.posthog_api_key
  host            = var.posthog_host
  organization_id = var.posthog_organization_id
  project_id      = var.posthog_project_id
}
