import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Settings, LogOut, Eye, EyeOff, Check, AlertCircle, Loader2,
  Zap, ChevronRight, Lock, Mail, KeyRound, Download, Upload, Trash2,
  Megaphone, MessageSquare, Palette, Shield, Sliders, Camera,
  UserCog, Users, Ban, UserMinus, ShieldCheck, ShieldOff, Plus, ExternalLink, Image, Pipette,
} from "lucide-react";

interface AuthUser {
  id: string; email: string; username?: string; bio?: string;
  avatar_url?: string; is_admin?: number; created_at?: number;
}
interface AdminUser extends AuthUser {
  email_verified?: number; banned?: number; ip?: string;
}

const THEMES = [
  { id: "default",         label: "Ocean",    color: "#0d1117" },
  { id: "swampy-green",    label: "Forest",   color: "#060d09" },
  { id: "royal-purple",    label: "Royal",    color: "#08060e" },
  { id: "blood-red",       label: "Crimson",  color: "#0a0405" },
  { id: "midnight-forest", label: "Midnight", color: "#050908" },
  { id: "cyber-neon",      label: "Cyber",    color: "#05050d" },
  { id: "desert-oasis",    label: "Desert",   color: "#0a0904" },
  { id: "glacial-frost",   label: "Frost",    color: "#050810" },
];

const SITE_PRESETS = [
  { id: "classroom", label: "Google Classroom", favicon: "https://ssl.gstatic.com/classroom/favicon.ico" },
  { id: "schoology",  label: "Schoology",        favicon: "https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico" },
  { id: "google",    label: "Google",            favicon: "https://www.google.com/favicon.ico" },
  { id: "petezah",   label: "PeteZah",           favicon: "/logo.png" },
];

type Section = "profile" | "appearance" | "cloaking" | "behavior" | "data" | "admin";

const THEME_COLORS: Record<string, { bgColor: string; textColor: string }> = {
  "default":         { bgColor: "hsl(220 30% 7%)", textColor: "#e6edf3" },
  "swampy-green":    { bgColor: "#060d09", textColor: "#cde8d0" },
  "royal-purple":    { bgColor: "#08060e", textColor: "#ddd0f5" },
  "blood-red":       { bgColor: "#0a0405", textColor: "#f5cdd0" },
  "midnight-forest": { bgColor: "#050908", textColor: "#c8ddd4" },
  "cyber-neon":      { bgColor: "#05050d", textColor: "#d0d0ff" },
  "desert-oasis":    { bgColor: "#0a0904", textColor: "#f0e0c0" },
  "glacial-frost":   { bgColor: "#050810", textColor: "#c8e0f0" },
};

function applySettingsNow(s: Record<string, string>) {
  if (s.theme) {
    document.body.className = document.body.className.replace(/theme-[\w-]+/g, "").trim();
    document.body.classList.add(`theme-${s.theme}`);
    const tc = THEME_COLORS[s.theme];
    if (tc && !s.backgroundColor && !s.backgroundImage) {
      document.body.style.color = tc.textColor;
    }
  }
  const bgImg = s.backgroundImage ?? localStorage.getItem("backgroundImage");
  const bgColor = s.backgroundColor ?? localStorage.getItem("backgroundColor");
  if (bgImg) {
    document.body.style.backgroundImage = `url(${bgImg})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundColor = "";
  } else {
    document.body.style.backgroundImage = "none";
    if (bgColor) document.body.style.backgroundColor = bgColor;
  }
  if (s.siteTitle) document.title = s.siteTitle;
  if (s.siteLogo) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = s.siteLogo;
  }
  const prevRC = (window as any).__rightClickHandler;
  if (prevRC) document.removeEventListener("contextmenu", prevRC);
  if (s.disableRightClick === "true") {
    const h = (e: MouseEvent) => e.preventDefault();
    (window as any).__rightClickHandler = h;
    document.addEventListener("contextmenu", h);
  }
  const prevUL = (window as any).__beforeUnloadHandler;
  if (prevUL) window.removeEventListener("beforeunload", prevUL);
  if (s.beforeUnload === "true") {
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    (window as any).__beforeUnloadHandler = h;
    window.addEventListener("beforeunload", h);
  }
  const prevPanic = (window as any).__panicKeyHandler;
  if (prevPanic) window.removeEventListener("keydown", prevPanic);
  if (s.panicKey && s.panicUrl) {
    const h = (e: KeyboardEvent) => { if (e.key === s.panicKey) window.location.href = s.panicUrl; };
    (window as any).__panicKeyHandler = h;
    window.addEventListener("keydown", h);
  }
  if (s.disableParticles === "true") {
    document.querySelectorAll(".particles, .particle, canvas[data-particles]").forEach(el => el.parentNode?.removeChild(el));
  }
  if (s.theme && !s.backgroundColor && !s.backgroundImage) {
    const tc = THEME_COLORS[s.theme];
    if (tc) {
      localStorage.setItem("backgroundColor", tc.bgColor);
      document.body.style.backgroundColor = tc.bgColor;
      document.body.style.backgroundImage = "none";
      document.body.style.color = tc.textColor;
    }
  }
  if (!s.backgroundImage) {
    localStorage.removeItem("backgroundImage");
  } else {
    localStorage.setItem("backgroundImage", s.backgroundImage);
  }
  Object.entries(s).forEach(([k, v]) => { if (k !== "backgroundImage") localStorage.setItem(k, v); });
  localStorage.setItem("settingsUpdated", Date.now().toString());
  window.dispatchEvent(new CustomEvent("petezah-settings-updated"));
}

function FluidCanvas({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : canvas.offsetWidth;
      const h = parent ? parent.clientHeight : canvas.offsetHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const blobs = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random() * (canvas.offsetWidth || 800),
      y: Math.random() * (canvas.offsetHeight || 600),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 140 + Math.random() * 200,
      hue: 200 + i * 10,
      saturation: 60 + Math.random() * 25,
      lightness: 40 + Math.random() * 15,
      opacity: 0.15 + Math.random() * 0.12,
    }));

    let time = 0;
    const animate = () => {
      time += 0.003;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      blobs.forEach((b) => {
        b.x += b.vx + Math.sin(time + b.hue) * 0.15;
        b.y += b.vy + Math.cos(time * 0.7 + b.hue) * 0.15;

        if (enabled) {
          const dx = mouseRef.current.x - b.x;
          const dy = mouseRef.current.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 300) {
            b.x += dx * 0.003;
            b.y += dy * 0.003;
          }
        }

        if (b.x < -b.radius) b.x = w + b.radius;
        if (b.x > w + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = h + b.radius;
        if (b.y > h + b.radius) b.y = -b.radius;

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${b.opacity * 2.2})`);
        grad.addColorStop(0.4, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${b.opacity * 1.1})`);
        grad.addColorStop(1, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });

      for (let i = 0; i < 3; i++) {
        const wx = w * (0.2 + i * 0.3) + Math.sin(time * 0.5 + i) * 60;
        const wy = h * (0.3 + i * 0.2) + Math.cos(time * 0.4 + i * 2) * 40;
        const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 120);
        wg.addColorStop(0, "hsla(210, 70%, 90%, 0.07)");
        wg.addColorStop(1, "hsla(210, 60%, 90%, 0)");
        ctx.fillStyle = wg;
        ctx.fillRect(0, 0, w, h);
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener("mousemove", handleMouse);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouse);
      cancelAnimationFrame(animRef.current);
    };
  }, [enabled]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

const C = {
  bg:       "hsl(216 32% 6%)",
  surface:  "hsl(216 26% 9%)",
  elevated: "hsl(216 22% 12%)",
  border:   "hsl(216 20% 16%)",
  borderFocus: "hsl(213 60% 40%)",
  accent:   "hsl(213 70% 58%)",
  accentDim:"hsl(213 50% 40%)",
  text:     "hsl(0 0% 96%)",
  textSub:  "hsl(216 15% 58%)",
  textMuted:"hsl(216 12% 32%)",
  danger:   "hsl(0 60% 56%)",
  success:  "hsl(145 50% 50%)",
};

function Field({ label, type = "text", value, onChange, placeholder, icon: Icon, maxLength, readOnly }: any) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>{label}</label>}
      <div style={{
        position: "relative", display: "flex", alignItems: "center",
        background: C.surface,
        border: `1px solid ${focused ? C.borderFocus : C.border}`,
        borderRadius: "8px", transition: "border-color 0.15s",
      }}>
        {Icon && <Icon size={12} style={{ position: "absolute", left: "12px", color: C.textMuted, flexShrink: 0 }} />}
        <input
          type={isPass && show ? "text" : type}
          value={value} onChange={onChange} placeholder={placeholder}
          maxLength={maxLength} readOnly={readOnly}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: "100%", background: "transparent", outline: "none",
            color: C.text, fontSize: "13px",
            padding: `9px ${isPass ? "36px" : "12px"} 9px ${Icon ? "34px" : "12px"}`,
            fontFamily: "inherit",
          }}
        />
        {isPass && (
          <button type="button" onClick={() => setShow(!show)} style={{ position: "absolute", right: "12px", color: C.textMuted, background: "none", border: "none", cursor: "pointer" }}>
            {show ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", gap: "16px" }}>
      <div>
        <p style={{ fontSize: "13px", color: C.text, margin: 0, fontWeight: 400 }}>{label}</p>
        {desc && <p style={{ fontSize: "11px", color: C.textMuted, margin: "2px 0 0" }}>{desc}</p>}
      </div>
      <button onClick={onChange} style={{
        width: "34px", height: "18px", borderRadius: "9px", position: "relative", flexShrink: 0,
        background: checked ? C.accentDim : C.elevated,
        border: `1px solid ${checked ? C.borderFocus : C.border}`,
        cursor: "pointer", transition: "background 0.2s, border-color 0.2s",
      }}>
        <span style={{
          position: "absolute", top: "2px", width: "12px", height: "12px", borderRadius: "50%",
          background: checked ? C.accent : C.textMuted,
          left: checked ? "calc(100% - 15px)" : "2px", transition: "left 0.2s, background 0.2s",
        }} />
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ height: "1px", background: C.border, margin: "2px 0" }} />;
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0 16px" }}>
      {children}
    </div>
  );
}

function ApplyBtn({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", borderRadius: "8px", marginTop: "18px",
      background: saved ? "transparent" : C.accentDim,
      border: `1px solid ${saved ? C.success : C.borderFocus}`,
      color: saved ? C.success : C.accent,
      fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
    }}>
      {saved ? <Check size={13} /> : <Zap size={13} />}
      {saved ? "Applied!" : "Apply Settings"}
    </button>
  );
}

const NAV: { id: Section; label: string; icon: any; adminOnly?: boolean }[] = [
  { id: "profile",    label: "Profile",     icon: User },
  { id: "appearance", label: "Appearance",  icon: Palette },
  { id: "cloaking",   label: "Cloaking",    icon: Shield },
  { id: "behavior",   label: "Behavior",    icon: Sliders },
  { id: "data",       label: "Data",        icon: Download },
  { id: "admin",      label: "Admin",       icon: UserCog, adminOnly: true },
];

export default function AccountPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("profile");

  const [authMode, setAuthMode]   = useState<"signin" | "signup">("signin");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [authErr, setAuthErr]     = useState("");
  const [authOk, setAuthOk]       = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [username, setUsername]   = useState("");
  const [bio, setBio]             = useState("");
  const [profSaving, setProfSaving] = useState(false);
  const [profMsg, setProfMsg]     = useState("");

  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const bgImgRef = useRef<HTMLInputElement>(null);

  function openAboutBlank() {
    const w = window.open("about:blank", "_blank");
    if (!w || w.closed) { alert("Please allow popups for about:blank to work."); return; }
    w.document.title = localStorage.getItem("siteTitle") || "Home";
    const link = w.document.createElement("link");
    link.rel = "icon";
    link.href = localStorage.getItem("siteLogo") || "/logo.png";
    w.document.head.appendChild(link);
    const iframe = w.document.createElement("iframe");
    iframe.src = "/";
    iframe.style.cssText = "width:100vw;height:100vh;border:none;";
    w.document.body.style.margin = "0";
    w.document.body.appendChild(iframe);
  }

  const [s, setS] = useState<Record<string, string>>({});
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [adminUsers, setAdminUsers]   = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(d => { if (d.user) { setUser(d.user); setUsername(d.user.username || ""); setBio(d.user.bio || ""); } })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const keys = ["theme","siteTitle","siteLogo","panicKey","panicUrl","beforeUnload","disableRightClick","disableParticles","autocloak","backgroundColor","backgroundImage"];
    const loaded: Record<string,string> = {};
    keys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) loaded[k] = v; });
    setS(loaded);
  }, []);

  useEffect(() => {
    if (section === "admin" && user && (user.is_admin ?? 0) >= 1 && adminUsers.length === 0) {
      setAdminLoading(true);
      fetch("/api/admin/users").then(r => r.json())
        .then(d => setAdminUsers(d.users || []))
        .finally(() => setAdminLoading(false));
    }
  }, [section, user]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(""); setAuthOk(""); setAuthLoading(true);
    try {
      const r = await fetch(`/api/${authMode}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }), credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) setAuthErr(d.error || "Something went wrong");
      else if (authMode === "signup") { setAuthOk(d.message || "Account created! Sign in now."); setAuthMode("signin"); setPassword(""); }
      else { setUser(d.user); setUsername(d.user.username || ""); setBio(d.user.bio || ""); }
    } catch { setAuthErr("Network error. Please try again."); }
    finally { setAuthLoading(false); }
  }

  async function saveProfile() {
    setProfSaving(true); setProfMsg("");
    try {
      const r = await fetch("/api/me", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ username, bio }),
      });
      if (r.ok) { setUser(u => u ? { ...u, username, bio } : u); setProfMsg("Saved!"); }
      else setProfMsg("Failed to save.");
    } finally { setProfSaving(false); setTimeout(() => setProfMsg(""), 2000); }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatarUploading(true);
    try {
      const r = await fetch("/api/me/avatar", {
        method: "POST", headers: { "Content-Type": file.type }, credentials: "include", body: file,
      });
      if (r.ok) { const d = await r.json(); setUser(u => u ? { ...u, avatar_url: d.avatar_url } : u); }
    } finally { setAvatarUploading(false); e.target.value = ""; }
  }

  async function signout() {
    await fetch("/api/signout", { method: "POST", credentials: "include" });
    setUser(null); setEmail(""); setPassword("");
  }

  const setVal = (k: string, v: string) => setS(prev => ({ ...prev, [k]: v }));
  const toggle = (k: string) => setS(prev => ({ ...prev, [k]: prev[k] === "true" ? "false" : "true" }));

  function applySettings() {
    applySettingsNow(s);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 1500);
  }

  function exportData() {
    const data = { localStorage: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "petezah-data.json"; a.click();
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.localStorage) {
          Object.entries(data.localStorage).forEach(([k, v]) => localStorage.setItem(k, String(v)));
          const keys = ["theme","siteTitle","siteLogo","panicKey","panicUrl","beforeUnload","disableRightClick","disableParticles","autocloak"];
          const loaded: Record<string,string> = {};
          keys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) loaded[k] = v; });
          setS(loaded); applySettingsNow(loaded);
        }
      } catch {}
    };
    reader.readAsText(file); e.target.value = "";
  }

  function resetData() {
    if (!confirm("Reset all local settings? This cannot be undone.")) return;
    localStorage.clear(); setS({}); document.title = "PeteZah";
  }

  async function adminAction(userId: string, action: string) {
    await fetch("/api/admin/user-action", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ userId, action }),
    });
    setAdminUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      if (action === "ban") return { ...u, banned: 1, email_verified: 0 };
      if (action === "suspend") return { ...u, email_verified: 0 };
      if (action === "promote_admin") return { ...u, is_admin: 3 };
      if (action === "demote_admin") return { ...u, is_admin: 0 };
      return u;
    }).filter(u => action === "delete" ? u.id !== userId : true));
  }

  const roleLabel = (n: number) => n >= 3 ? "Admin" : n >= 2 ? "Staff" : n >= 1 ? "Mod" : "User";
  const roleColor = (n: number) => n >= 3 ? C.accent : n >= 2 ? "hsl(270 55% 65%)" : n >= 1 ? "hsl(165 50% 52%)" : C.textMuted;

  const isAdmin = (user?.is_admin ?? 0) >= 1;
  const visibleSections = NAV.filter(s => !s.adminOnly || isAdmin);

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
      <Loader2 size={20} className="animate-spin" style={{ color: C.accent }} />
    </div>
  );

  if (!user) return (
    <div style={{ height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, overflow: "hidden" }}>
      <FluidCanvas enabled={true} />

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "320px", padding: "0 20px" }}
      >
        <div style={{
          background: "hsla(216, 32%, 7%, 0.75)", backdropFilter: "blur(20px)",
          border: `1px solid ${C.border}`, borderRadius: "14px", padding: "28px 24px",
          boxShadow: "0 24px 48px hsla(216, 50%, 4%, 0.5)",
        }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px", margin: "0 auto 12px",
              background: C.accentDim, border: `1px solid ${C.borderFocus}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User size={18} color={C.accent} />
            </div>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>
              {authMode === "signin" ? "Welcome back" : "Create account"}
            </h2>
            <p style={{ fontSize: "11px", color: C.textSub, margin: 0 }}>
              {authMode === "signin" ? "Sign in to sync your settings" : "Get started with PeteZah"}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {authErr && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "7px", marginBottom: "14px",
                  background: "hsl(0 60% 50% / 0.08)", border: "1px solid hsl(0 60% 50% / 0.2)", color: "hsl(0 60% 68%)", fontSize: "11px" }}>
                <AlertCircle size={11} style={{ flexShrink: 0 }} />{authErr}
              </motion.div>
            )}
            {authOk && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "7px", marginBottom: "14px",
                  background: "hsl(145 50% 42% / 0.1)", border: "1px solid hsl(145 50% 42% / 0.25)", color: "hsl(145 50% 60%)", fontSize: "11px" }}>
                <Check size={11} style={{ flexShrink: 0 }} />{authOk}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Field type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="Email address" icon={Mail} />
            <Field type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="Password" icon={KeyRound} />
            <button type="submit" disabled={authLoading} style={{
              marginTop: "4px", width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${C.borderFocus}`,
              background: C.accentDim, color: C.text, fontSize: "13px", fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
              cursor: authLoading ? "not-allowed" : "pointer", opacity: authLoading ? 0.7 : 1, transition: "opacity 0.2s",
            }}>
              {authLoading && <Loader2 size={13} className="animate-spin" />}
              {authMode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <button
            onClick={() => { setAuthMode(m => m === "signin" ? "signup" : "signin"); setAuthErr(""); setAuthOk(""); }}
            style={{ width: "100%", marginTop: "14px", background: "none", border: "none", cursor: "pointer",
              fontSize: "11px", color: C.textSub, textAlign: "center", transition: "color 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textSub)}>
            {authMode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
          </button>
        </div>
      </motion.div>
    </div>
  );

  const avatarLetter = (user.username || user.email)[0].toUpperCase();

  return (
    <div style={{ height: "100%", display: "flex", background: C.bg, overflow: "hidden" }}>

      <div style={{
        width: "190px", flexShrink: 0, display: "flex", flexDirection: "column",
        borderRight: `1px solid ${C.border}`, padding: "18px 10px",
        background: C.surface,
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginBottom: "20px", paddingBottom: "16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "14px", overflow: "hidden",
              background: C.accentDim, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px", fontWeight: 700, color: C.accent,
            }}>
              {user.avatar_url
                ? <img src={user.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : avatarLetter}
            </div>
            <button onClick={() => avatarRef.current?.click()} style={{
              position: "absolute", bottom: "-3px", right: "-3px", width: "18px", height: "18px", borderRadius: "50%",
              background: C.accentDim, border: `2px solid ${C.bg}`, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {avatarUploading ? <Loader2 size={8} color={C.accent} className="animate-spin" /> : <Camera size={8} color={C.accent} />}
            </button>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={uploadAvatar} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{user.username || user.email.split("@")[0]}</span>
              {(user.is_admin ?? 0) > 0 && (
                <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "4px",
                  background: `${roleColor(user.is_admin!)}18`, color: roleColor(user.is_admin!), border: `1px solid ${roleColor(user.is_admin!)}30` }}>
                  {roleLabel(user.is_admin!)}
                </span>
              )}
            </div>
            <p style={{ fontSize: "9px", color: C.textMuted, margin: "2px 0 0" }}>{user.email}</p>
          </div>
        </div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1px" }}>
          {visibleSections.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button key={id} onClick={() => setSection(id)} style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "7px", width: "100%",
                background: active ? `${C.accentDim}50` : "transparent",
                border: `1px solid ${active ? C.borderFocus : "transparent"}`,
                color: active ? C.accent : C.textSub,
                fontSize: "12px", fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.12s", textAlign: "left",
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.elevated; e.currentTarget.style.color = C.text; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSub; } }}>
                <Icon size={12} />
                {label}
              </button>
            );
          })}
        </nav>

        <button onClick={signout} style={{
          display: "flex", alignItems: "center", gap: "7px", padding: "8px 10px", borderRadius: "7px",
          background: "transparent", border: `1px solid transparent`,
          color: C.textMuted, fontSize: "11px", fontWeight: 500, cursor: "pointer", marginTop: "6px", transition: "all 0.12s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "hsl(0 60% 50% / 0.08)"; e.currentTarget.style.color = C.danger; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.2)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = "transparent"; }}>
          <LogOut size={11} />Sign out
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 30px", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
        <AnimatePresence mode="wait">
          <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}>

            {section === "profile" && (
              <div style={{ maxWidth: "440px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Profile</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 22px" }}>
                  {user.created_at ? `Member since ${new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}` : "Manage your profile"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <Field label="Username" value={username} onChange={(e: any) => setUsername(e.target.value)} placeholder="Display name" maxLength={32} icon={User} />
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Bio</label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="A short bio..." maxLength={200} rows={3}
                      style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px",
                        color: C.text, fontSize: "13px", padding: "9px 12px", outline: "none", resize: "none",
                        fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
                      onFocus={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                      onBlur={e => (e.currentTarget.style.borderColor = C.border)} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <button onClick={saveProfile} disabled={profSaving} style={{
                      display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px",
                      background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                      color: C.accent, fontSize: "12px", fontWeight: 600, cursor: "pointer", opacity: profSaving ? 0.6 : 1, transition: "opacity 0.2s",
                    }}>
                      {profSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Save
                    </button>
                    {profMsg && <span style={{ fontSize: "11px", color: profMsg === "Saved!" ? C.success : C.danger }}>{profMsg}</span>}
                  </div>
                </div>

                <Divider />
                <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 6px" }}>Community</p>
                  {[
                    { label: "Changelog", desc: "See what's new", url: "petezah://changelog", icon: Megaphone },
                    { label: "Feedback", desc: "Share your thoughts", url: "petezah://feedback", icon: MessageSquare },
                  ].map(({ label, desc, url, icon: Icon }) => (
                    <button key={url} onClick={() => onNavigate(url)} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "9px",
                      background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", width: "100%", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Icon size={12} style={{ color: C.accent }} />
                        <div style={{ textAlign: "left" }}>
                          <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>{label}</p>
                          <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>{desc}</p>
                        </div>
                      </div>
                      <ChevronRight size={11} style={{ color: C.textMuted }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {section === "appearance" && (
              <div style={{ maxWidth: "500px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Appearance</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Customize the look of PeteZah</p>

                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 10px" }}>Theme</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "7px", marginBottom: "22px" }}>
                  {THEMES.map(t => {
                    const active = s.theme === t.id;
                    return (
                      <button key={t.id} onClick={() => { setVal("theme", t.id); setVal("backgroundColor", ""); setVal("backgroundImage", ""); }} style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "10px 6px", borderRadius: "9px", cursor: "pointer",
                        background: active ? `${C.accentDim}40` : C.surface,
                        border: `1px solid ${active ? C.borderFocus : C.border}`,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = C.accentDim; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = C.border; }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: t.color, border: `1px solid ${C.border}` }} />
                        <span style={{ fontSize: "9px", fontWeight: 500, color: active ? C.accent : C.textSub }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 10px" }}>Background</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Background Color</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ position: "relative", width: "36px", height: "36px", borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
                          <input type="color" value={s.backgroundColor || THEME_COLORS[s.theme || "default"]?.bgColor || "#0A1D37"}
                            onChange={e => { setVal("backgroundColor", e.target.value); setVal("backgroundImage", ""); }}
                            style={{ position: "absolute", inset: "-4px", width: "calc(100% + 8px)", height: "calc(100% + 8px)", cursor: "pointer", border: "none", padding: 0 }} />
                        </div>
                        <input type="text" value={s.backgroundColor || THEME_COLORS[s.theme || "default"]?.bgColor || "#0A1D37"}
                          onChange={e => { setVal("backgroundColor", e.target.value); setVal("backgroundImage", ""); }}
                          style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.text, fontSize: "12px", padding: "8px 10px", outline: "none", fontFamily: "monospace" }} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", color: C.textMuted }}>Background Image</label>
                    <input ref={bgImgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => { setVal("backgroundImage", ev.target?.result as string); setVal("backgroundColor", ""); };
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }} />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => bgImgRef.current?.click()} style={{
                        flex: 1, display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderRadius: "8px",
                        background: C.surface, border: `1px solid ${C.border}`, color: C.textSub, fontSize: "12px", cursor: "pointer", transition: "border-color 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = C.borderFocus}
                      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                        <Image size={12} />
                        {s.backgroundImage ? "Image set — click to change" : "Upload image"}
                      </button>
                      {s.backgroundImage && (
                        <button onClick={() => setVal("backgroundImage", "")} style={{
                          padding: "9px 12px", borderRadius: "8px", background: "transparent",
                          border: `1px solid hsl(0 60% 50% / 0.2)`, color: C.danger, fontSize: "11px", cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "hsl(0 60% 50% / 0.08)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          Remove
                        </button>
                      )}
                    </div>
                    {s.backgroundImage && (
                      <div style={{ marginTop: "8px", borderRadius: "8px", overflow: "hidden", height: "80px", border: `1px solid ${C.border}` }}>
                        <img src={s.backgroundImage} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Background preview" />
                      </div>
                    )}
                  </div>
                </div>

                  <ApplyBtn saved={settingsSaved} onClick={applySettings} />
              </div>
            )}

            {section === "cloaking" && (
              <div style={{ maxWidth: "440px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Cloaking</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Disguise the tab to look like another site</p>

                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "0 0 8px" }}>Quick Presets</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "18px" }}>
                  {SITE_PRESETS.map(p => {
                    const active = s.siteTitle === p.label;
                    return (
                      <button key={p.id} onClick={() => { setVal("siteTitle", p.label); setVal("siteLogo", p.favicon); }}
                        style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 11px", borderRadius: "8px", cursor: "pointer",
                          background: active ? `${C.accentDim}40` : C.surface,
                          border: `1px solid ${active ? C.borderFocus : C.border}`,
                          color: active ? C.accent : C.textSub, fontSize: "11px", transition: "all 0.15s" }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = C.accentDim; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = C.border; }}>
                        <img src={p.favicon} style={{ width: "12px", height: "12px" }} alt=""
                          onError={e => ((e.target as HTMLImageElement).style.display = "none")} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                  <Field label="Custom tab title" value={s.siteTitle || ""} onChange={(e: any) => setVal("siteTitle", e.target.value)} placeholder="e.g. Google Classroom" />
                  <Field label="Custom favicon URL" value={s.siteLogo || ""} onChange={(e: any) => setVal("siteLogo", e.target.value)} placeholder="https://..." icon={Lock} />
                </div>

                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>About:Blank</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>Open the site disguised inside an about:blank popup</p>
                <button onClick={openAboutBlank} style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", borderRadius: "8px", marginBottom: "18px",
                  background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                  color: C.accent, fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                }}>
                  <ExternalLink size={12} />
                  Open in about:blank
                </button>

                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>Panic Key</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>Press a key to instantly redirect the browser</p>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "10px", marginBottom: "4px" }}>
                  <Field label="Key" value={s.panicKey || ""} onChange={(e: any) => setVal("panicKey", e.target.value)} placeholder="q" maxLength={1} icon={KeyRound} />
                  <Field label="Redirect URL" value={s.panicUrl || ""} onChange={(e: any) => setVal("panicUrl", e.target.value)} placeholder="https://google.com" icon={Lock} />
                </div>
                <ApplyBtn saved={settingsSaved} onClick={applySettings} />
              </div>
            )}

            {section === "behavior" && (
              <div style={{ maxWidth: "420px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Behavior</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Control how the browser behaves</p>
                <SectionCard>
                  <div style={{ borderBottom: `1px solid ${C.border}` }}>
                    <Toggle label="Exit warning" desc="Show a confirmation before closing the tab" checked={s.beforeUnload === "true"} onChange={() => toggle("beforeUnload")} />
                  </div>
                  <div style={{ borderBottom: `1px solid ${C.border}` }}>
                    <Toggle label="Autocloak" desc="Wrap the site in about:blank on load" checked={s.autocloak === "true"} onChange={() => {
                      const next = s.autocloak !== "true";
                      setVal("autocloak", next ? "true" : "false");
                      localStorage.setItem("autocloak", next ? "true" : "false");
                      if (next) openAboutBlank();
                    }} />
                  </div>
                  <div style={{ borderBottom: `1px solid ${C.border}` }}>
                    <Toggle label="Disable right click" desc="Block the browser context menu" checked={s.disableRightClick === "true"} onChange={() => toggle("disableRightClick")} />
                  </div>
                  <Toggle label="Disable particles" desc="Remove background animations on new tab" checked={s.disableParticles === "true"} onChange={() => toggle("disableParticles")} />
                </SectionCard>
                <Divider />
                <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, margin: "14px 0 6px" }}>About:Blank</p>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 10px" }}>Open the site disguised inside an about:blank popup</p>
                <button onClick={openAboutBlank} style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", borderRadius: "8px", marginBottom: "18px",
                  background: C.accentDim, border: `1px solid ${C.borderFocus}`,
                  color: C.accent, fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                }}>
                  <ExternalLink size={12} />
                  Open in about:blank
                </button>
                <ApplyBtn saved={settingsSaved} onClick={applySettings} />
              </div>
            )}

            {section === "data" && (
              <div style={{ maxWidth: "400px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: "0 0 3px" }}>Data</h2>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 20px" }}>Import, export, or reset your local data</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    { label: "Export Data", desc: "Download settings as JSON", icon: Download, onClick: exportData },
                  ].map(item => (
                    <button key={item.label} onClick={item.onClick} style={{
                      display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                      background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", width: "100%", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                      <item.icon size={13} style={{ color: C.accent }} />
                      <div style={{ textAlign: "left" }}>
                        <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>{item.label}</p>
                        <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>{item.desc}</p>
                      </div>
                    </button>
                  ))}

                  <label style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                    background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                    <Upload size={13} style={{ color: C.accent }} />
                    <div>
                      <p style={{ fontSize: "12px", fontWeight: 500, color: C.text, margin: 0 }}>Import Data</p>
                      <p style={{ fontSize: "10px", color: C.textSub, margin: 0 }}>Restore settings from a JSON file</p>
                    </div>
                    <input type="file" accept=".json" style={{ display: "none" }} onChange={importData} />
                  </label>

                  <Divider />

                  <button onClick={resetData} style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "9px",
                    background: "transparent", border: `1px solid hsl(0 60% 50% / 0.15)`, cursor: "pointer", width: "100%", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "hsl(0 60% 50% / 0.07)"; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "hsl(0 60% 50% / 0.15)"; }}>
                    <Trash2 size={13} style={{ color: C.danger }} />
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: "12px", fontWeight: 500, color: C.danger, margin: 0 }}>Reset All Data</p>
                      <p style={{ fontSize: "10px", color: "hsl(0 60% 40%)", margin: 0 }}>Clear all local settings — cannot be undone</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {section === "admin" && isAdmin && (
              <div style={{ maxWidth: "600px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, color: C.text, margin: 0 }}>Admin Panel</h2>
                  <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: `${C.accentDim}40`, border: `1px solid ${C.borderFocus}`, color: C.accent }}>
                    {adminUsers.length} {adminUsers.length === 1 ? "user" : "users"}
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: C.textSub, margin: "0 0 14px" }}>Manage users and moderate content</p>
                <input
                  value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search by name or email..."
                  style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.text, fontSize: "12px", padding: "8px 12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "16px", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = C.borderFocus)}
                  onBlur={e => (e.currentTarget.style.borderColor = C.border)}
                />
                {adminLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: C.accent }} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {adminUsers.filter(u => {
                      const q = adminSearch.toLowerCase();
                      return !q || (u.username || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                    }).map(u => (
                      <div key={u.id} style={{
                        display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "9px",
                        background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <div style={{
                          width: "32px", height: "32px", borderRadius: "9px", flexShrink: 0, overflow: "hidden",
                          background: C.accentDim, border: `1px solid ${C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: C.accent,
                        }}>
                          {u.avatar_url ? <img src={u.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : (u.username || u.email)[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: C.text }}>{u.username || u.email.split("@")[0]}</span>
                            <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "4px",
                              background: `${roleColor(u.is_admin ?? 0)}18`, color: roleColor(u.is_admin ?? 0), border: `1px solid ${roleColor(u.is_admin ?? 0)}30` }}>
                              {roleLabel(u.is_admin ?? 0)}
                            </span>
                            {u.banned ? <span style={{ fontSize: "8px", padding: "1px 4px", borderRadius: "4px", background: "hsl(0 60% 50% / 0.1)", color: C.danger, border: "1px solid hsl(0 60% 50% / 0.2)" }}>Banned</span> : null}
                          </div>
                          <p style={{ fontSize: "10px", color: C.textMuted, margin: "1px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</p>
                        </div>
                        {u.id !== user.id && (
                          <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                            {(user.is_admin ?? 0) >= 3 && (u.is_admin ?? 0) < 3 && (
                              <button title="Promote to Admin" onClick={() => adminAction(u.id, "promote_admin")} style={iconBtn}>
                                <ShieldCheck size={11} style={{ color: C.accent }} />
                              </button>
                            )}
                            {(user.is_admin ?? 0) >= 3 && (u.is_admin ?? 0) >= 1 && (
                              <button title="Demote to User" onClick={() => adminAction(u.id, "demote_admin")} style={iconBtn}>
                                <ShieldOff size={11} style={{ color: "hsl(38 75% 58%)" }} />
                              </button>
                            )}
                            {(u.email_verified ?? 1) === 1 && !u.banned && (
                              <button title="Suspend" onClick={() => adminAction(u.id, "suspend")} style={iconBtn}>
                                <UserMinus size={11} style={{ color: "hsl(38 75% 58%)" }} />
                              </button>
                            )}
                            {!u.banned && (
                              <button title="Ban" onClick={() => adminAction(u.id, "ban")} style={iconBtn}>
                                <Ban size={11} style={{ color: C.danger }} />
                              </button>
                            )}
                            <button title="Delete user" onClick={() => { if (confirm(`Delete ${u.email}?`)) adminAction(u.id, "delete"); }} style={iconBtn}>
                              <Trash2 size={11} style={{ color: C.danger }} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: "26px", height: "26px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center",
  background: C.elevated, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s",
};