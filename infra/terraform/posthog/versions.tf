terraform {
  required_version = ">= 1.6.0"

  required_providers {
    posthog = {
      source  = "registry.terraform.io/PostHog/posthog"
      version = "~> 1.0"
    }
  }
}
