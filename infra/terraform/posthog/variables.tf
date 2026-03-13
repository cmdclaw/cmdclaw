variable "posthog_api_key" {
  description = "PostHog personal API key."
  type        = string
  sensitive   = true
  default     = null
}

variable "posthog_host" {
  description = "Base URL for the PostHog API. Leave null to use POSTHOG_HOST or the provider default."
  type        = string
  default     = null
}

variable "posthog_organization_id" {
  description = "PostHog organization ID."
  type        = string
  default     = null
}

variable "posthog_project_id" {
  description = "PostHog project ID."
  type        = string
  default     = null
}
