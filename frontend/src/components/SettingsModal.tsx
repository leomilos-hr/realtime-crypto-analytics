"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { INTERVALS, Interval } from "@/lib/types";
import PriceAlertManager from "./PriceAlertManager";

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "\u20AC", label: "Euro" },
  { code: "GBP", symbol: "\u00A3", label: "British Pound" },
];

const CHART_STYLES = [
  { id: "candle" as const, label: "Candlestick" },
  { id: "line" as const, label: "Line" },
];

const DECIMAL_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "2", label: "2" },
  { id: "4", label: "4" },
  { id: "8", label: "8" },
];

const GROUPING_OPTIONS = [
  { id: "comma", label: "1,000.00", desc: "Comma" },
  { id: "period", label: "1.000,00", desc: "Period" },
  { id: "space", label: "1 000.00", desc: "Space" },
  { id: "none", label: "1000.00", desc: "None" },
];

interface UserData {
  name: string | null;
  email: string;
  provider: string | null;
  settings: {
    defaultInterval?: string;
    currency?: string;
    chartStyle?: string;
    theme?: string;
    compactMode?: boolean;
    numberFormat?: { decimals: string; grouping: string };
    notifications?: boolean;
  };
}

export interface SettingsChangePayload {
  defaultInterval?: Interval;
  currency?: string;
  chartStyle?: "candle" | "line";
  theme?: "dark" | "light";
  compactMode?: boolean;
  numberFormat?: { decimals: string; grouping: string };
  notifications?: boolean;
}

interface Props {
  onClose: () => void;
  onSettingsChange: (settings: SettingsChangePayload) => void;
  currentTheme?: "dark" | "light";
}

export default function SettingsModal({ onClose, onSettingsChange, currentTheme = "dark" }: Props) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [name, setName] = useState("");
  const [defaultInterval, setDefaultInterval] = useState<string>("1h");
  const [currency, setCurrency] = useState("USD");
  const [chartStyle, setChartStyle] = useState<"candle" | "line">("candle");
  const [selectedTheme, setSelectedTheme] = useState<"dark" | "light">(currentTheme);
  const [compactMode, setCompactMode] = useState(false);
  const [decimals, setDecimals] = useState("auto");
  const [grouping, setGrouping] = useState("comma");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "preferences" | "alerts" | "security">("profile");

  useEffect(() => {
    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
    }
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: UserData) => {
        setUserData(data);
        setName(data.name || "");
        setDefaultInterval(data.settings?.defaultInterval || "1h");
        setCurrency(data.settings?.currency || "USD");
        setChartStyle((data.settings?.chartStyle as "candle" | "line") || "candle");
        if (data.settings?.theme) setSelectedTheme(data.settings.theme as "dark" | "light");
        if (data.settings?.compactMode !== undefined) setCompactMode(data.settings.compactMode);
        if (data.settings?.numberFormat) {
          setDecimals(data.settings.numberFormat.decimals || "auto");
          setGrouping(data.settings.numberFormat.grouping || "comma");
        }
        if (data.settings?.notifications !== undefined) setNotificationsEnabled(data.settings.notifications);
      })
      .catch(() => {});
  }, []);

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) showMsg("success", "Profile updated");
      else showMsg("error", "Failed to update profile");
    } catch {
      showMsg("error", "Failed to update profile");
    }
    setSaving(false);
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      const numberFormat = { decimals, grouping };
      const settings = { defaultInterval, currency, chartStyle, theme: selectedTheme, compactMode, numberFormat, notifications: notificationsEnabled };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        showMsg("success", "Preferences saved");
        onSettingsChange({
          defaultInterval: defaultInterval as Interval,
          currency,
          chartStyle,
          theme: selectedTheme,
          compactMode,
          numberFormat,
          notifications: notificationsEnabled,
        });
      } else {
        showMsg("error", "Failed to save preferences");
      }
    } catch {
      showMsg("error", "Failed to save preferences");
    }
    setSaving(false);
  };

  const changePassword = async () => {
    if (newPassword.length < 6) {
      showMsg("error", "Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      showMsg("error", "Passwords don't match");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("success", "Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        showMsg("error", data.error || "Failed to change password");
      }
    } catch {
      showMsg("error", "Failed to change password");
    }
    setSaving(false);
  };

  const deleteAccount = async () => {
    try {
      const res = await fetch("/api/delete-account", { method: "DELETE" });
      if (res.ok) {
        signOut({ callbackUrl: "/login" });
      } else {
        showMsg("error", "Failed to delete account");
      }
    } catch {
      showMsg("error", "Failed to delete account");
    }
  };

  const tabs = [
    { id: "profile" as const, label: "Profile" },
    { id: "preferences" as const, label: "Preferences" },
    { id: "alerts" as const, label: "Alerts" },
    { id: "security" as const, label: "Security" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl view-enter overflow-hidden"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border-color)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-3 gap-1 overflow-x-auto" style={{ borderBottom: "1px solid var(--border-color)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap"
              style={{
                color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-muted)",
                backgroundColor: activeTab === tab.id ? "var(--bg-input)" : "transparent",
                borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-6 mt-4 px-4 py-2 rounded-lg text-sm ${message.type === "success" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
            {message.text}
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Email
                </label>
                <div
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: "var(--bg-input)", color: "var(--text-muted)", border: "1px solid var(--border-color)" }}
                >
                  {userData?.email || "..."}
                  {userData?.provider === "google" && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Google</span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
                  style={{ backgroundColor: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
                />
              </div>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </>
          )}

          {/* Preferences Tab */}
          {activeTab === "preferences" && (
            <>
              {/* Theme */}
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Theme
                </label>
                <div className="flex gap-2">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTheme(t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        selectedTheme === t ? "bg-blue-600 text-white" : ""
                      }`}
                      style={selectedTheme !== t ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                    >
                      {t === "dark" ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                        </svg>
                      )}
                      {t === "dark" ? "Dark" : "Light"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Compact Mode */}
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Layout Density
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCompactMode(false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      !compactMode ? "bg-blue-600 text-white" : ""
                    }`}
                    style={compactMode ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                    Comfortable
                  </button>
                  <button
                    onClick={() => setCompactMode(true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      compactMode ? "bg-blue-600 text-white" : ""
                    }`}
                    style={!compactMode ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9.5" y="2" width="5" height="5" rx="1"/>
                      <rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="9.5" width="5" height="5" rx="1"/>
                      <rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="17" y="9.5" width="5" height="5" rx="1"/>
                      <rect x="2" y="17" width="5" height="5" rx="1"/><rect x="9.5" y="17" width="5" height="5" rx="1"/>
                      <rect x="17" y="17" width="5" height="5" rx="1"/>
                    </svg>
                    Compact
                  </button>
                </div>
              </div>

              {/* Default Interval */}
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Default Chart Interval
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {INTERVALS.map((i) => (
                    <button
                      key={i}
                      onClick={() => setDefaultInterval(i)}
                      className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                        defaultInterval === i ? "bg-blue-600 text-white" : ""
                      }`}
                      style={defaultInterval !== i ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              {/* Currency */}
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Display Currency
                </label>
                <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                  Prices are converted from USD using live exchange rates
                </p>
                <div className="flex gap-2">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setCurrency(c.code)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currency === c.code ? "bg-blue-600 text-white" : ""
                      }`}
                      style={currency !== c.code ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                    >
                      <span className="text-lg">{c.symbol}</span>
                      <span className="block text-xs mt-0.5">{c.code}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart Style */}
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Chart Style
                </label>
                <div className="flex gap-2">
                  {CHART_STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setChartStyle(s.id)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        chartStyle === s.id ? "bg-blue-600 text-white" : ""
                      }`}
                      style={chartStyle !== s.id ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                    >
                      {s.id === "candle" ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="9" y1="2" x2="9" y2="22"/><rect x="5" y="7" width="8" height="10" rx="1" fill="currentColor" opacity="0.3"/>
                          <line x1="18" y1="4" x2="18" y2="20"/><rect x="14" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.3"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 8 13 13 9 9 2 16"/>
                        </svg>
                      )}
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number Format */}
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Decimal Places
                </label>
                <div className="flex gap-1.5">
                  {DECIMAL_OPTIONS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDecimals(d.id)}
                      className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${
                        decimals === d.id ? "bg-blue-600 text-white" : ""
                      }`}
                      style={decimals !== d.id ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Auto adjusts based on price (2 for BTC, 4+ for small coins)
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Number Grouping
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {GROUPING_OPTIONS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setGrouping(g.id)}
                      className={`py-1.5 px-2 text-sm rounded-md font-mono transition-colors ${
                        grouping === g.id ? "bg-blue-600 text-white" : ""
                      }`}
                      style={grouping !== g.id ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={savePreferences}
                disabled={saving}
                className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Preferences"}
              </button>
            </>
          )}

          {/* Alerts Tab */}
          {activeTab === "alerts" && (
            <>
              {/* Notification Permission */}
              <div className="rounded-lg p-3" style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Browser Notifications
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Get push notifications when alerts trigger
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !notificationsEnabled;
                      setNotificationsEnabled(next);
                      // If enabling and no permission yet, request it
                      if (next && "Notification" in window && Notification.permission === "default") {
                        Notification.requestPermission().then((p) => setNotifPermission(p));
                      }
                    }}
                    className="relative w-10 h-5 rounded-full transition-colors"
                    style={{ backgroundColor: notificationsEnabled ? "#3b82f6" : "var(--border-color)" }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                      style={{ left: notificationsEnabled ? "calc(100% - 18px)" : "2px" }}
                    />
                  </button>
                </div>
                {notifPermission === "denied" && (
                  <p className="text-xs text-red-400">
                    Notifications are blocked by your browser. Enable them in your browser&apos;s site settings.
                  </p>
                )}
                {notifPermission === "default" && notificationsEnabled && (
                  <button
                    onClick={() => {
                      if ("Notification" in window) {
                        Notification.requestPermission().then((p) => setNotifPermission(p));
                      }
                    }}
                    className="text-xs text-blue-400 hover:underline mt-1"
                  >
                    Grant notification permission
                  </button>
                )}
                {notifPermission === "granted" && notificationsEnabled && (
                  <p className="text-xs text-green-400 mt-1">Notifications enabled</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  Price Alerts
                </h3>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Set target prices to be alerted when reached
                </p>
              </div>
              <PriceAlertManager />

              <button
                onClick={savePreferences}
                disabled={saving}
                className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Notification Settings"}
              </button>
            </>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  {userData?.provider === "google" ? "Set Password" : "Change Password"}
                </h3>
                {userData?.provider === "google" && (
                  <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                    You signed in with Google. You can set a password to also log in with email/password.
                  </p>
                )}
                {userData?.provider !== "google" && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
                      style={{ backgroundColor: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
                    />
                  </div>
                )}
                <div className="mb-3">
                  <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
                    style={{ backgroundColor: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
                    style={{ backgroundColor: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
                  />
                </div>
                <button
                  onClick={changePassword}
                  disabled={saving || !newPassword}
                  className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Update Password"}
                </button>
              </div>

              {/* Delete Account */}
              <div className="pt-4" style={{ borderTop: "1px solid var(--border-color)" }}>
                <h3 className="text-sm font-semibold mb-2 text-red-400">Danger Zone</h3>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Permanently delete your account and all associated data. This cannot be undone.
                </p>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2 rounded-lg text-sm font-medium border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Delete Account
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-red-400 font-medium">Are you sure? This is permanent.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={deleteAccount}
                        className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                        style={{ backgroundColor: "var(--bg-input)", color: "var(--text-muted)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
