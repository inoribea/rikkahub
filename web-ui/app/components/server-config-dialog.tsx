import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Server, Check, X, Loader2, Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  getServerConfig,
  setServerConfig,
  isValidApiUrl,
  normalizeApiUrl,
  hasEnvApiBaseUrl,
  getEnvApiBaseUrlForDisplay,
} from "~/stores/server-config";

interface ServerConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServerConfigDialog({ open, onOpenChange }: ServerConfigDialogProps) {
  const { t } = useTranslation("common");
  const [useCustomUrl, setUseCustomUrl] = React.useState(false);
  const [apiBaseUrl, setApiBaseUrl] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<"success" | "error" | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const envApiUrl = React.useMemo(() => getEnvApiBaseUrlForDisplay(), []);
  const hasEnvConfig = hasEnvApiBaseUrl();

  React.useEffect(() => {
    if (open) {
      const config = getServerConfig();
      setUseCustomUrl(config.useCustomUrl);
      setApiBaseUrl(config.apiBaseUrl || "");
      setTestResult(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const handleTestConnection = React.useCallback(async () => {
    if (!apiBaseUrl.trim()) {
      toast.error(t("server_config.url_required"));
      return;
    }

    const normalized = normalizeApiUrl(apiBaseUrl);
    if (!isValidApiUrl(normalized)) {
      toast.error(t("server_config.invalid_url"));
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const testUrl = `${normalized}/api/settings/stream`;
      const response = await fetch(testUrl, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
        },
      });

      if (response.ok || response.headers.get("content-type")?.includes("text/event-stream")) {
        setTestResult("success");
        toast.success(t("server_config.connection_success"));
      } else if (response.status === 401) {
        setTestResult("success");
        toast.success(t("server_config.connection_success_auth"));
      } else {
        setTestResult("error");
        toast.error(t("server_config.connection_failed", { status: response.status }));
      }
    } catch (error) {
      setTestResult("error");
      toast.error(t("server_config.connection_error"));
      console.error("Connection test failed:", error);
    } finally {
      setTesting(false);
    }
  }, [apiBaseUrl, t]);

  const handleSave = React.useCallback(() => {
    if (useCustomUrl && apiBaseUrl.trim()) {
      const normalized = normalizeApiUrl(apiBaseUrl);
      if (!isValidApiUrl(normalized)) {
        toast.error(t("server_config.invalid_url"));
        return;
      }
      setServerConfig({
        useCustomUrl: true,
        apiBaseUrl: normalized,
      });
    } else {
      setServerConfig({
        useCustomUrl: false,
        apiBaseUrl: null,
      });
    }

    toast.success(t("server_config.saved"));
    onOpenChange(false);

    setTimeout(() => {
      window.location.reload();
    }, 500);
  }, [useCustomUrl, apiBaseUrl, t, onOpenChange]);

  const handleReset = React.useCallback(() => {
    setUseCustomUrl(false);
    setApiBaseUrl("");
    setTestResult(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-5" />
            {t("server_config.title")}
          </DialogTitle>
          <DialogDescription>{t("server_config.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {hasEnvConfig && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
              <Info className="size-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{t("server_config.env_configured")}</p>
                <p className="text-muted-foreground font-mono text-xs mt-1">{envApiUrl}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useCustomUrl"
              checked={useCustomUrl}
              onChange={(e) => setUseCustomUrl(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <label htmlFor="useCustomUrl" className="text-sm">
              {t("server_config.use_custom_url")}
            </label>
          </div>

          {useCustomUrl && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("server_config.api_url_label")}</label>
                <Input
                  ref={inputRef}
                  type="url"
                  placeholder="http://192.168.1.100:8080"
                  value={apiBaseUrl}
                  onChange={(e) => {
                    setApiBaseUrl(e.target.value);
                    setTestResult(null);
                  }}
                  disabled={!useCustomUrl}
                />
                <p className="text-xs text-muted-foreground">
                  {t("server_config.url_hint")}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing || !apiBaseUrl.trim()}
                >
                  {testing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : testResult === "success" ? (
                    <Check className="size-4 text-green-500" />
                  ) : testResult === "error" ? (
                    <X className="size-4 text-destructive" />
                  ) : (
                    <Server className="size-4" />
                  )}
                  {testing ? t("server_config.testing") : t("server_config.test_connection")}
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={handleReset}>
              {t("server_config.reset")}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("server_config.cancel")}
              </Button>
              <Button type="button" onClick={handleSave}>
                {t("server_config.save")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}