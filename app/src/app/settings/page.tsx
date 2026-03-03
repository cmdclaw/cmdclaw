"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useCurrentUser, useSetUserTimezone } from "@/orpc/hooks";

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

function getPhoneNumber(user: unknown): string {
  if (user && typeof user === "object" && "phoneNumber" in user) {
    const value = (user as { phoneNumber?: string | null }).phoneNumber;
    if (typeof value !== "string" || value.length === 0) {
      return "";
    }
    return value.startsWith("+") ? value : `+${value}`;
  }
  return "";
}

function isValidIanaTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export default function SettingsPage() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingPhone, setRemovingPhone] = useState(false);
  const [timezoneInput, setTimezoneInput] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const { data: currentUser } = useCurrentUser();
  const setUserTimezone = useSetUserTimezone();
  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "", []);
  const supportedTimezones = useMemo(() => {
    const intlWithSupportedValues = Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    };
    if (typeof intlWithSupportedValues.supportedValuesOf !== "function") {
      return [];
    }
    return intlWithSupportedValues.supportedValuesOf("timeZone");
  }, []);

  useEffect(() => {
    authClient
      .getSession()
      .then((res) => {
        setSessionData(res?.data ?? null);
        if (res?.data?.user?.name) {
          const nameParts = res.data.user.name.split(" ");
          setFirstName(nameParts[0] || "");
          setLastName(nameParts.slice(1).join(" ") || "");
        }
        const phone = getPhoneNumber(res?.data?.user);
        if (phone) {
          setPhoneNumber(phone);
        }
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (currentUser?.timezone) {
      setTimezoneInput(currentUser.timezone);
      return;
    }
    if (browserTimezone) {
      setTimezoneInput(browserTimezone);
    }
  }, [currentUser?.timezone, browserTimezone]);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);

      try {
        const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
        await authClient.updateUser({
          name: fullName,
          phoneNumber: phoneNumber || undefined,
        });
        setNotification({ type: "success", message: "Settings saved" });
      } catch (error) {
        console.error("Failed to update user:", error);
        setNotification({ type: "error", message: "Failed to save settings" });
      } finally {
        setSaving(false);
      }
    },
    [firstName, lastName, phoneNumber],
  );

  const handleRemovePhoneNumber = useCallback(async () => {
    setRemovingPhone(true);
    try {
      const res = await fetch("/api/settings/phone-number", {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to remove phone number");
      }
      setPhoneNumber("");
      setSessionData((prev: SessionData | null) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                phoneNumber: null,
              },
            }
          : prev,
      );
      setNotification({ type: "success", message: "Phone number removed" });
    } catch (error) {
      console.error("Failed to remove phone number:", error);
      setNotification({
        type: "error",
        message: "Failed to remove phone number",
      });
    } finally {
      setRemovingPhone(false);
    }
  }, []);

  const handleFirstNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setFirstName(event.target.value);
  }, []);

  const handleLastNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setLastName(event.target.value);
  }, []);

  const handlePhoneNumberChange = useCallback((value?: string) => {
    setPhoneNumber(value ?? "");
  }, []);

  const handleTimezoneInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setTimezoneInput(event.target.value);
  }, []);

  const handleSaveTimezone = useCallback(async () => {
    const timezone = timezoneInput.trim();
    if (!timezone || !isValidIanaTimezone(timezone)) {
      setNotification({ type: "error", message: "Enter a valid IANA timezone" });
      return;
    }

    try {
      await setUserTimezone.mutateAsync(timezone);
      setNotification({ type: "success", message: "Timezone updated" });
    } catch (error) {
      console.error("Failed to update timezone:", error);
      setNotification({ type: "error", message: "Failed to update timezone" });
    }
  }, [setUserTimezone, timezoneInput]);

  const handleUseBrowserTimezone = useCallback(() => {
    if (!browserTimezone) {
      return;
    }
    setTimezoneInput(browserTimezone);
    void setUserTimezone
      .mutateAsync(browserTimezone)
      .then(() => setNotification({ type: "success", message: "Timezone updated" }))
      .catch((error) => {
        console.error("Failed to update timezone:", error);
        setNotification({ type: "error", message: "Failed to update timezone" });
      });
  }, [browserTimezone, setUserTimezone]);

  const user = sessionData?.user;
  const savedTimezone = currentUser?.timezone ?? "";
  const timezoneDiffers =
    Boolean(savedTimezone) && Boolean(browserTimezone) && savedTimezone !== browserTimezone;

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (status === "error" || !user) {
    return (
      <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
        Unable to load your account. Please try again.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">General Settings</h2>
        <p className="text-muted-foreground mt-1 text-sm">Manage your account information.</p>
      </div>

      {notification && (
        <div
          className={cn(
            "mb-6 flex items-center gap-2 rounded-lg border p-3 text-sm",
            notification.type === "success"
              ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          {notification.message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Email</label>
            <Input type="email" value={user.email} disabled className="bg-muted/50" />
            <p className="text-muted-foreground mt-1 text-xs">Email cannot be changed.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">First name</label>
              <Input
                type="text"
                value={firstName}
                onChange={handleFirstNameChange}
                placeholder="Enter your first name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Last name</label>
              <Input
                type="text"
                value={lastName}
                onChange={handleLastNameChange}
                placeholder="Enter your last name"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Phone number</label>
            <PhoneInput
              defaultCountry="US"
              international
              countryCallingCodeEditable={false}
              value={phoneNumber}
              onChange={handlePhoneNumberChange}
              placeholder="Enter your phone number"
            />
            {phoneNumber ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleRemovePhoneNumber}
                disabled={removingPhone}
              >
                {removingPhone ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  "Remove phone number"
                )}
              </Button>
            ) : null}
          </div>

          <div className="rounded-lg border p-4">
            <label className="mb-2 block text-sm font-medium">Timezone</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={timezoneInput}
                onChange={handleTimezoneInputChange}
                list="timezone-options"
                placeholder="Europe/Dublin"
                className="sm:flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveTimezone}
                disabled={setUserTimezone.isPending}
              >
                {setUserTimezone.isPending ? "Saving..." : "Save timezone"}
              </Button>
            </div>
            <datalist id="timezone-options">
              {supportedTimezones.map((timezone) => (
                <option key={timezone} value={timezone} />
              ))}
            </datalist>
            <p className="text-muted-foreground mt-2 text-xs">
              Used for integration date/time formatting in sandbox tools.
            </p>
            {timezoneDiffers ? (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="text-amber-900 dark:text-amber-200">
                  Browser timezone is <strong>{browserTimezone}</strong>, but your saved timezone is{" "}
                  <strong>{savedTimezone}</strong>.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleUseBrowserTimezone}
                  disabled={setUserTimezone.isPending}
                >
                  Use browser timezone
                </Button>
              </div>
            ) : null}
          </div>

          {/* Email forwarding settings intentionally hidden for now. */}
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </form>
    </div>
  );
}
