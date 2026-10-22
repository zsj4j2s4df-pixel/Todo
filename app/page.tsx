"use client";
import { useEffect, useRef, useState } from "react";
import { ZodError } from "zod";
import { supabase } from "@/lib/supabase";
import {
  blankItem,
  itemSchema,
  Item,
  Member,
  localDate,
  mapLink,
  parseCapture,
} from "@/lib/model";
import { SessionRequests } from "@/lib/session";
import { calendarExport, occursOn } from "@/lib/calendar";
import NotificationInbox, {
  InboxNotification,
  NotificationPreferences,
} from "@/components/NotificationInbox";
import MonthCalendar from "@/components/MonthCalendar";
import DueReminders from "@/components/DueReminders";
import { captureFromUrl } from "@/lib/capture";
import { AIProposal, aiProposalSchema } from "@/lib/ai-proposal";
import Assistant from "@/components/Assistant";
import BriefingSettings from "@/components/BriefingSettings";
import {
  briefDefaults,
  briefSchema,
  normalizeBrief,
  BriefPreferences,
} from "@/lib/brief-preferences";
import ChecklistEditor from "@/components/ChecklistEditor";
import PushSettings from "@/components/PushSettings";
import { detachDevicePush } from "@/lib/push";
import DayBrief from "@/components/DayBrief";
import Icon from "@/components/AppIcon";
const key = "todo-device-v1";
const labels = { task: "Taak", event: "Afspraak", reminder: "Herinnering" };
export default function Home() {
  const [items, setItems] = useState<Item[]>([]),
    [ready, setReady] = useState(false),
    [user, setUser] = useState("device"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signedIn, setSignedIn] = useState(false),
    [recovery, setRecovery] = useState(false),
    [household, setHousehold] = useState<string | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [view, setView] = useState("today"),
    [filter, setFilter] = useState("open"),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [capture, setCapture] = useState(""),
    [captureOpen, setCaptureOpen] = useState(false),
    [name, setName] = useState(""),
    [houseName, setHouseName] = useState("Ons huishouden"),
    [invite, setInvite] = useState(""),
    [provider, setProvider] = useState("google");
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    assignment_enabled: true,
    completion_enabled: true,
  });
  const [briefPreferences, setBriefPreferences] =
    useState<BriefPreferences>(briefDefaults);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const pendingShare = useRef<string | null>(null);
  const cloud = !!supabase;
  const requests = useRef(new SessionRequests());
  const identity = useRef("");
  async function load(uid: string) {
    const client = supabase;
    if (!client) return;
    await requests.current.run(
      uid,
      async () => {
        const [rows, member, inbox, prefs, briefPrefs] = await Promise.all([
          client
            .from("items")
            .select("*")
            .order("created_at", { ascending: false }),
          client
            .from("household_members")
            .select("*")
            .eq("user_id", uid)
            .maybeSingle(),
          client
            .from("notifications")
            .select("id,item_id,kind,created_at,read_at")
            .order("created_at", { ascending: false })
            .limit(50),
          client
            .from("notification_preferences")
            .select("assignment_enabled,completion_enabled")
            .eq("user_id", uid)
            .maybeSingle(),
          client
            .from("brief_preferences")
            .select("*")
            .eq("user_id", uid)
            .maybeSingle(),
        ]);
        if (rows.error) throw rows.error;
        if (member.error) throw member.error;
        if (inbox.error)
          throw Error(
            "Meldingen konden niet worden geladen. Controleer of alle database-migraties zijn toegepast.",
          );
        if (prefs.error) throw prefs.error;
        if (briefPrefs.error) throw briefPrefs.error;

        let people: Member[] = [];
        if (member.data) {
          const all = await client
            .from("household_members")
            .select("user_id,display_name")
            .eq("household_id", member.data.household_id);
          if (all.error) throw all.error;
          people = all.data || [];
        }
        return {
          items: (rows.data || []).map((i) => ({
            ...i,
            due_at: i.due_at || "",
            end_at: i.end_at || "",
          })),
          household: member.data?.household_id || null,
          people,
          briefPreferences: briefPrefs.data
            ? normalizeBrief(briefPrefs.data)
            : {
                ...briefDefaults,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
          notifications: (inbox.data || []) as InboxNotification[],
          preferences: prefs.data || {
            assignment_enabled: true,
            completion_enabled: true,
          },
        };
      },
      (data) => {
        setItems(data.items);
        setHousehold(data.household);
        setMembers(data.people);
        setNotifications(data.notifications);
        setPreferences(data.preferences);
        setBriefPreferences(data.briefPreferences);
      },
    );
  }
  useEffect(() => {
    setProvider(localStorage.getItem("todo-maps") || "google");
    setRemindersEnabled(
      localStorage.getItem("todo-reminder-signals") !== "off",
    );
    const incoming = new URL(window.location.href);
    const received = captureFromUrl(incoming);
    if (received) {
      pendingShare.current = received.text;
      for (const field of ["capture", "title", "text", "url"])
        incoming.searchParams.delete(field);
      history.replaceState(
        null,
        "",
        incoming.pathname + incoming.search + incoming.hash,
      );
      if (received.truncated)
        setNotice(
          "De gedeelde tekst is ingekort tot 5000 tekens. Controleer het concept.",
        );
    }

    if (!supabase) {
      try {
        const brief = localStorage.getItem("todo-device-brief");
        if (brief) setBriefPreferences(normalizeBrief(JSON.parse(brief)));
        else
          setBriefPreferences({
            ...briefDefaults,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        const saved = localStorage.getItem(key);
        if (saved)
          setItems(JSON.parse(saved).map((i: unknown) => itemSchema.parse(i)));
      } catch {
        setError(
          "Opgeslagen gegevens konden niet worden gelezen. Gebruik je JSON-back-up om ze te herstellen.",
        );
      }
      setReady(true);
      return;
    }
    const client = supabase;
    let active = true;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (_event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setView("settings");
      }
      const nextUser = session?.user.id || "";
      requests.current.reset(nextUser);
      if (identity.current !== nextUser) {
        setBriefPreferences(briefDefaults);
        setDraft(null);
        setCaptureOpen(false);
        setCapture("");
        setInvite("");
        setError("");
        setNotice("");
        setPassword("");
        setRecovery(_event === "PASSWORD_RECOVERY");
      }
      identity.current = nextUser;
      setUser(session?.user.id || "");
      setSignedIn(!!session);
      setItems([]);
      setHousehold(null);
      setMembers([]);
      setNotifications([]);
      setPreferences({ assignment_enabled: true, completion_enabled: true });

      if (session)
        void load(session.user.id)
          .catch((e) => setError(e.message))
          .finally(() => setReady(true));
      else setReady(true);
    });
    return () => {
      active = false;
      requests.current.reset("");
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!draft && !captureOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setDraft(null);
        setCaptureOpen(false);
      }
      if (event.key === "Tab") {
        const modal = document.querySelector('[role="dialog"]');
        const nodes = Array.from(
          modal?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
          ) || [],
        ).filter((n) => !n.closest("fieldset:disabled"));
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [!!draft, captureOpen, busy]);
  useEffect(() => {
    if (ready && (!cloud || signedIn) && pendingShare.current !== null) {
      setCapture(pendingShare.current);
      setCaptureOpen(true);
      pendingShare.current = null;
    }
  }, [ready, cloud, signedIn]);
  async function markRead(id: string) {
    await action(async () => {
      if (!supabase) return;
      const result = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .single();
      if (result.error) throw result.error;
      await load(user);
    });
  }
  async function saveBriefPreferences(next: BriefPreferences) {
    await action(async () => {
      const valid = briefSchema.parse(next);
      if (supabase) {
        const r = await supabase
          .from("brief_preferences")
          .upsert({ user_id: user, ...valid })
          .select("user_id")
          .single();
        if (r.error) throw r.error;
        await load(user);
      } else {
        localStorage.setItem("todo-device-brief", JSON.stringify(valid));
        setBriefPreferences(valid);
      }
      setNotice("Dagbriefing opgeslagen.");
    });
  }
  async function savePreferences(next: NotificationPreferences) {
    await action(async () => {
      if (!supabase) return;
      const result = await supabase
        .from("notification_preferences")
        .upsert({ user_id: user, ...next })
        .select("user_id")
        .single();
      if (result.error) throw result.error;
      setPreferences(next);
      setNotice("Meldingsvoorkeuren opgeslagen.");
    });
  }
  async function snoozeReminder(item: Item) {
    await action(async () => {
      const due_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      if (supabase) {
        const result = await supabase
          .from("items")
          .update({ due_at })
          .eq("id", item.id)
          .select("id")
          .single();
        if (result.error) throw result.error;
        await load(user);
      } else
        persist(
          items.map((i) =>
            i.id === item.id
              ? { ...i, due_at, updated_at: new Date().toISOString() }
              : i,
          ),
        );
      setNotice("Herinnering 10 minuten uitgesteld.");
    });
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof ZodError
          ? e.issues.map((issue) => issue.message).join(" ")
          : e instanceof Error
            ? e.message
            : "Er ging iets mis. Probeer opnieuw.",
      );
    } finally {
      setBusy(false);
    }
  }
  function persist(next: Item[]) {
    localStorage.setItem(key, JSON.stringify(next));
    setItems(next);
  }
  async function commitAI(raw: AIProposal) {
    const proposal = aiProposalSchema.parse(raw);
    if (proposal.action === "create") {
      const valid = itemSchema.parse({
        ...blankItem(user, household, proposal.item.kind),
        ...proposal.item,
      });
      if (supabase) {
        const r = await supabase
          .from("items")
          .insert({
            ...valid,
            due_at: valid.due_at || null,
            end_at: valid.end_at || null,
          })
          .select("id")
          .single();
        if (r.error) throw Error("Toevoegen is niet gelukt. Probeer opnieuw.");
        await load(user);
      } else persist([valid, ...items]);
    } else {
      if (!supabase) throw Error("Log eerst in.");
      if (proposal.action === "complete") {
        const r = await supabase.rpc("complete_item_if_current", {
          item_id: proposal.id,
          done: proposal.done,
          expected_updated_at: proposal.expected_updated_at,
        });
        if (r.error)
          throw Error(
            "Het item is gewijzigd of je hebt geen toegang meer. Vraag een nieuw voorstel.",
          );
      } else if (proposal.action === "delete") {
        const r = await supabase
          .from("items")
          .delete()
          .eq("id", proposal.id)
          .eq("updated_at", proposal.expected_updated_at)
          .select("id")
          .single();
        if (r.error)
          throw Error(
            "Verwijderen is niet gelukt. Het item kan zijn gewijzigd of je hebt geen toegang meer.",
          );
      } else {
        const current = await supabase
          .from("items")
          .select("*")
          .eq("id", proposal.id)
          .single();
        if (current.error) throw Error("Item niet beschikbaar.");
        const valid = itemSchema.parse({
          ...current.data,
          due_at: current.data.due_at || "",
          end_at: current.data.end_at || "",
          ...proposal.patch,
        });
        const patch = {
          ...proposal.patch,
          ...(proposal.patch.due_at !== undefined
            ? { due_at: valid.due_at || null }
            : {}),
        };
        const r = await supabase
          .from("items")
          .update(patch)
          .eq("id", proposal.id)
          .eq("updated_at", proposal.expected_updated_at)
          .select("id")
          .single();
        if (r.error)
          throw Error(
            "Het item is gewijzigd of je hebt geen toegang meer. Vraag een nieuw voorstel.",
          );
      }
      await load(user);
    }
    setNotice("AI-voorstel uitgevoerd.");
  }
  async function save() {
    if (!draft) return;
    await action(async () => {
      const valid = itemSchema.parse({
        ...draft,
        updated_at: new Date().toISOString(),
      });
      if (supabase) {
        const payload = {
          ...valid,
          due_at: valid.due_at || null,
          end_at: valid.end_at || null,
        };
        const exists = items.some((i) => i.id === valid.id);
        const result = exists
          ? await supabase
              .from("items")
              .update(payload)
              .eq("id", valid.id)
              .select("id")
              .single()
          : await supabase.from("items").insert(payload).select("id").single();
        if (result.error) throw result.error;
        await load(user);
      } else persist([valid, ...items.filter((i) => i.id !== valid.id)]);
      setDraft(null);
      setNotice("Opgeslagen.");
    });
  }
  async function toggle(i: Item) {
    await action(async () => {
      if (supabase) {
        const result = await supabase.rpc("complete_item", {
          item_id: i.id,
          done: i.status !== "done",
        });
        if (result.error) throw result.error;
        await load(user);
      } else
        persist(
          items.map((x) =>
            x.id === i.id
              ? {
                  ...x,
                  status: x.status === "done" ? "open" : "done",
                  updated_at: new Date().toISOString(),
                }
              : x,
          ),
        );
    });
  }
  async function remove(i: Item) {
    if (!confirm(`“${i.title}” verwijderen?`)) return;
    await action(async () => {
      if (supabase) {
        const r = await supabase
          .from("items")
          .delete()
          .eq("id", i.id)
          .select("id")
          .single();
        if (r.error) throw r.error;
        await load(user);
      } else persist(items.filter((x) => x.id !== i.id));
      setDraft(null);
    });
  }
  function add(kind: Item["kind"] = "task") {
    setError("");
    setDraft(blankItem(user, household, kind));
  }
  function exportCalendar() {
    const count = items.filter((i) => i.kind === "event" && i.due_at).length;
    if (!count) {
      setNotice("Er zijn nog geen afspraken om te exporteren.");
      return;
    }
    if (
      !confirm(
        "Ook zichtbare privéafspraken komen in dit bestand. Exporteer alleen naar een agenda waarmee je deze details wilt delen. Doorgaan?",
      )
    )
      return;
    const url = URL.createObjectURL(
      new Blob([calendarExport(items)], {
        type: "text/calendar;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "todo-agenda.ics";
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(items, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "todo-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const open = items.filter((i) => i.status === "open");
  const todayItems = open.filter(
    (i) => i.due_at && new Date(i.due_at) <= today,
  );
  const done = items.filter((i) => i.status === "done").length;
  const shown = items
    .filter(
      (i) =>
        (view !== "calendar" || i.kind === "event") &&
        (view !== "calendar" || !calendarDay || occursOn(i, calendarDay)) &&
        (view !== "reminders" || i.kind === "reminder") &&
        (view !== "today" || !i.due_at || new Date(i.due_at) <= today) &&
        (view !== "tasks" || i.kind === "task") &&
        (filter === "all" || i.status === filter) &&
        (i.title + " " + i.description + " " + i.category)
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"));
  const fmt = (value: string) =>
    new Date(value).toLocaleString("nl-NL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="/">
          todo<span className="brand-dot">.</span>
          <span className="brand-line">een beetje meer rust</span>
        </a>
        <p className="nav-caption">JOUW OVERZICHT</p>
        <nav>
          {[
            ["today", "home", "Vandaag"],
            ["tasks", "list", "Alle taken"],
            ["calendar", "calendar", "Agenda"],
            ["reminders", "bell", "Herinneringen"],
            ["assistant", "notebook", "Assistent"],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={view === id ? "nav active" : "nav"}
              onClick={() => {
                setView(id);
                setFilter("open");
              }}
            >
              <Icon name={icon} />
              {label}
              <span>
                {id === "tasks"
                  ? open.filter((i) => i.kind === "task").length
                  : id === "today"
                    ? todayItems.length
                    : ""}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="notebook" />
          <p>
            Niet alles hoeft vandaag.
            <br />
            Eén ding tegelijk is ook goed.
          </p>
        </div>
        <button
          className={
            view === "settings" ? "nav active settings" : "nav settings"
          }
          aria-label="Instellingen"
          onClick={() => setView("settings")}
        >
          <Icon name="settings" />
          Instellingen
        </button>
        <div className="mode">
          <i />
          {cloud
            ? signedIn
              ? "Account verbonden"
              : "Accountmodus"
            : "Op dit apparaat"}
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            {new Date().toLocaleDateString("nl-NL", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <span className="privacy-note">
            Samen waar gewenst. Privé waar nodig.
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">RUIMTE IN JE HOOFD</p>
              <h1>
                {view === "today"
                  ? "Een frisse blik op vandaag."
                  : view === "tasks"
                    ? "Kleine stappen, grote rust."
                    : view === "calendar"
                      ? "Iets om naar uit te kijken."
                      : view === "assistant"
                        ? "Even samen nadenken."
                        : view === "settings"
                          ? "Helemaal op jouw manier."
                          : "Op het juiste moment."}
              </h1>
              <p className="subtitle">
                {view === "today"
                  ? "Een rustig overzicht van wat aandacht verdient."
                  : view === "settings"
                    ? "Je gegevens, je huishouden en je voorkeuren."
                    : "Alles op één plek. Jij houdt het overzicht."}
              </p>
            </div>
            {view !== "settings" && view !== "assistant" && (
              <button
                className="primary"
                disabled={!ready || busy || (cloud && !signedIn)}
                onClick={() =>
                  add(
                    view === "calendar"
                      ? "event"
                      : view === "reminders"
                        ? "reminder"
                        : "task",
                  )
                }
              >
                <Icon name="plus" />
                {view === "calendar"
                  ? "Afspraak"
                  : view === "reminders"
                    ? "Herinnering"
                    : "Taak"}{" "}
                toevoegen
              </button>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
            </div>
          )}
          {!cloud && (
            <div className="local-note">
              Deze versie bewaart gegevens alleen in deze browser. Delen en
              accounts zijn hier niet actief.
            </div>
          )}
          {cloud && !signedIn ? (
            <section className="panel auth">
              <h2>Welkom thuis.</h2>
              <p>Log in om je eigen gegevens veilig te bekijken.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const r = await supabase!.auth.signInWithPassword({
                      email,
                      password,
                    });
                    if (r.error) throw r.error;
                  });
                }}
              >
                <label>
                  E-mailadres
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Wachtwoord
                  <input
                    type="password"
                    minLength={12}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Inloggen
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      if (!email || password.length < 12)
                        throw Error(
                          "Vul een geldig e-mailadres en een wachtwoord van minstens 12 tekens in.",
                        );
                      const r = await supabase!.auth.signUp({
                        email,
                        password,
                      });
                      if (r.error) throw r.error;
                      setNotice(
                        "Account aangevraagd. Controleer je e-mail als bevestiging is ingeschakeld.",
                      );
                    })
                  }
                >
                  Account maken
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      if (!email) throw Error("Vul eerst je e-mailadres in.");
                      const r =
                        await supabase!.auth.resetPasswordForEmail(email);
                      if (r.error) throw r.error;
                      setNotice(
                        "Controleer je e-mail voor het herstellen van je wachtwoord.",
                      );
                    })
                  }
                >
                  Wachtwoord vergeten
                </button>
              </form>
            </section>
          ) : view === "assistant" ? (
            <Assistant
              key={user}
              onCommit={commitAI}
              onDraft={(proposal) => {
                try {
                  setDraft(
                    itemSchema.parse({
                      ...blankItem(user, household, proposal.kind),
                      ...proposal,
                    }),
                  );
                } catch {
                  setError(
                    "Het AI-concept is niet geldig. Maak zelf een taak aan.",
                  );
                }
              }}
            />
          ) : view === "settings" ? (
            <div className="settings-grid">
              <section className="panel">
                <h2>Jouw gegevens</h2>
                <p>
                  {cloud
                    ? "Je gegevens worden met je account opgeslagen."
                    : "Lokale gegevens blijven in deze browser. Maak regelmatig een back-up."}
                </p>
                <button className="secondary" onClick={exportData}>
                  JSON-back-up downloaden
                </button>
                <button className="secondary" onClick={exportCalendar}>
                  Agenda downloaden (.ics)
                </button>
                {!cloud && (
                  <label className="file-label">
                    Back-up terugzetten
                    <input
                      type="file"
                      accept="application/json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void action(async () => {
                            if (file.size > 2_000_000)
                              throw Error(
                                "Bestand is te groot (maximaal 2 MB).",
                              );
                            const raw = JSON.parse(await file.text());
                            if (!Array.isArray(raw) || raw.length > 5000)
                              throw Error("Ongeldige back-up.");
                            const parsed = raw.map((x) =>
                              itemSchema.parse({
                                ...x,
                                owner_id: "device",
                                household_id: null,
                                visibility: "private",
                                assignees: [],
                                selected_users: [],
                              }),
                            );
                            if (
                              new Set(parsed.map((x) => x.id)).size !==
                              parsed.length
                            )
                              throw Error("Dubbele items in back-up.");
                            if (
                              !confirm(
                                "Huidige lokale gegevens vervangen door deze back-up?",
                              )
                            )
                              return;
                            persist(parsed);
                            setNotice("Back-up teruggezet.");
                          });
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <label>
                  Navigatie-app
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value);
                      localStorage.setItem("todo-maps", e.target.value);
                    }}
                  >
                    <option value="google">Google Maps</option>
                    <option value="apple">Apple Maps</option>
                    <option value="waze">Waze</option>
                  </select>
                </label>
                {recovery && (
                  <>
                    <label>
                      Nieuw wachtwoord
                      <input
                        type="password"
                        minLength={12}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          if (password.length < 12)
                            throw Error("Gebruik minstens 12 tekens.");
                          const r = await supabase!.auth.updateUser({
                            password,
                          });
                          if (r.error) throw r.error;
                          setPassword("");
                          setRecovery(false);
                          setNotice("Wachtwoord gewijzigd.");
                        })
                      }
                    >
                      Wachtwoord opslaan
                    </button>
                  </>
                )}
                {signedIn && (
                  <button
                    className="secondary"
                    onClick={() =>
                      void action(async () => {
                        await detachDevicePush(user);
                        const r = await supabase!.auth.signOut();
                        if (r.error) throw r.error;
                      })
                    }
                  >
                    Uitloggen
                  </button>
                )}
              </section>
              <section className="panel">
                <h2>Samen, met eigen ruimte</h2>
                {!cloud ? (
                  <p>
                    Accounts en delen vereisen de Supabase-configuratie uit de
                    README. Lokale gegevens worden niet automatisch geüpload.
                  </p>
                ) : household ? (
                  <>
                    <p>{members.map((m) => m.display_name).join(" · ")}</p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const r = await supabase!.rpc("create_invite");
                          if (r.error) throw r.error;
                          setInvite(r.data);
                          setNotice(
                            "Code is één dag geldig en kan één keer worden gebruikt. Deel de code alleen met je huisgenoot.",
                          );
                        })
                      }
                    >
                      Uitnodigingscode maken
                    </button>
                    {invite && <p className="invite">{invite}</p>}
                  </>
                ) : (
                  <>
                    <label>
                      Jouw naam
                      <input
                        value={name}
                        maxLength={80}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label>
                      Naam huishouden
                      <input
                        value={houseName}
                        maxLength={80}
                        onChange={(e) => setHouseName(e.target.value)}
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          if (!name.trim()) throw Error("Vul je naam in.");
                          const r = await supabase!.rpc("create_household", {
                            household_name: houseName,
                            member_name: name,
                          });
                          if (r.error) throw r.error;
                          await load(user);
                        })
                      }
                    >
                      Huishouden maken
                    </button>
                    <label>
                      Of gebruik een uitnodigingscode
                      <input
                        value={invite}
                        onChange={(e) => setInvite(e.target.value)}
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          if (!name.trim()) throw Error("Vul je naam in.");
                          const r = await supabase!.rpc("join_household", {
                            invite_code: invite,
                            member_name: name,
                          });
                          if (r.error) throw r.error;
                          await load(user);
                        })
                      }
                    >
                      Aansluiten
                    </button>
                  </>
                )}
                <hr />
                {cloud && (
                  <>
                    <h3>Meldingen binnen de app</h3>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={preferences.assignment_enabled}
                        disabled={busy}
                        onChange={(e) =>
                          void savePreferences({
                            ...preferences,
                            assignment_enabled: e.target.checked,
                          })
                        }
                      />
                      Nieuwe toewijzingen
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={preferences.completion_enabled}
                        disabled={busy}
                        onChange={(e) =>
                          void savePreferences({
                            ...preferences,
                            completion_enabled: e.target.checked,
                          })
                        }
                      />
                      Afrondingen
                    </label>
                    <p className="hint">
                      Deze voorkeuren gelden voor je account. Bestaande
                      meldingen blijven bewaard zolang je toegang hebt tot het
                      item.
                    </p>
                  </>
                )}
                <BriefingSettings
                  value={briefPreferences}
                  onSave={(next) => void saveBriefPreferences(next)}
                  busy={busy}
                />
                {cloud && signedIn && (
                  <PushSettings
                    key={user}
                    user={user}
                    deliveryTime={briefPreferences.delivery_time}
                  />
                )}
                <h3>Herinneringssignalen</h3>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={remindersEnabled}
                    onChange={(e) => {
                      setRemindersEnabled(e.target.checked);
                      localStorage.setItem(
                        "todo-reminder-signals",
                        e.target.checked ? "on" : "off",
                      );
                    }}
                  />
                  Toon vervallen herinneringen terwijl de app open is
                </label>
                <h3>Over herinneringen</h3>
                <p>
                  Herinneringen verschijnen in je overzicht. Push kun je
                  hierboven per apparaat aanzetten. Siri is nog niet
                  aangesloten.
                </p>
              </section>
            </div>
          ) : (
            <>
              {cloud && (
                <NotificationInbox
                  notifications={notifications}
                  items={items}
                  busy={busy}
                  onRead={(id) => void markRead(id)}
                  onOpen={setDraft}
                  onRefresh={() => void action(() => load(user))}
                />
              )}
              <DueReminders
                key={user}
                items={items}
                enabled={remindersEnabled}
                busy={busy}
                user={user}
                onOpen={setDraft}
                onSnooze={(item) => void snoozeReminder(item)}
              />
              {view === "calendar" && (
                <MonthCalendar
                  items={items.filter(
                    (i) =>
                      (filter === "all" || i.status === filter) &&
                      (i.title + " " + i.description + " " + i.category)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )}
                  selected={calendarDay}
                  onSelect={setCalendarDay}
                />
              )}
              {view === "today" && (
                <DayBrief
                  items={items}
                  preferences={briefPreferences}
                  onOpen={setDraft}
                />
              )}
              <section className="overview">
                <div className="stat">
                  <span>Nog te doen</span>
                  <strong>
                    {open.filter((i) => i.kind === "task").length}
                    <small>taken</small>
                  </strong>
                  <div className="stat-line" />
                </div>
                <div className="stat">
                  <span>Vandaag of eerder</span>
                  <strong>
                    {todayItems.length}
                    <small>items</small>
                  </strong>
                  <div className="stat-line" />
                </div>
                <div className="stat">
                  <span>Al afgestreept</span>
                  <strong>
                    {done}
                    <small>klaar</small>
                  </strong>
                  <div className="stat-line" />
                </div>
                <div className="quote">
                  <span>Een kleine herinnering</span>
                  <p>
                    Maak ruimte voor
                    <br />
                    wat ertoe doet.
                  </p>
                  <Icon name="arrow" />
                </div>
              </section>
              <div className="workspace">
                <section className="panel task-panel">
                  <div className="section-heading">
                    {cloud && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void action(() => load(user))}
                        aria-label="Vernieuwen"
                      >
                        Vernieuwen
                      </button>
                    )}
                    <h2>
                      {view === "today"
                        ? "Jouw aandacht vandaag"
                        : view === "calendar"
                          ? "Jouw agenda"
                          : view === "reminders"
                            ? "Jouw herinneringen"
                            : "Alle taken"}
                    </h2>
                    <span className="count">{shown.length}</span>
                    <button
                      className="text-button capture-button"
                      onClick={() => setCaptureOpen(true)}
                    >
                      Snel invoeren <Icon name="arrow" />
                    </button>
                  </div>
                  <div className="toolbar">
                    <div className="tabs">
                      {[
                        ["open", "Te doen"],
                        ["done", "Afgerond"],
                        ["all", "Alles"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          className={filter === id ? "selected" : ""}
                          onClick={() => setFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <input
                      aria-label="Zoeken"
                      className="search"
                      placeholder="Zoek iets…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="task-list">
                    {!ready ? (
                      <p>Je overzicht wordt geladen…</p>
                    ) : shown.length ? (
                      shown
                        .filter((i) => view !== "tasks" || i.kind === "task")
                        .map((i) => (
                          <article
                            key={i.id}
                            className={
                              "task-row " +
                              (i.status === "done" ? "completed" : "")
                            }
                          >
                            <button
                              className="checkbox"
                              aria-label={`${i.status === "done" ? "Heropen" : "Voltooi"} ${i.title}`}
                              disabled={
                                busy ||
                                (cloud &&
                                  i.owner_id !== user &&
                                  !i.assignees.includes(user))
                              }
                              onClick={() => void toggle(i)}
                            >
                              {i.status === "done" && <Icon />}
                            </button>
                            <button
                              className="task-info"
                              onClick={() => {
                                setError("");
                                setDraft(i);
                              }}
                            >
                              <strong>{i.title}</strong>
                              <span>
                                {i.category || labels[i.kind]}
                                <b>·</b>
                                {i.visibility === "private"
                                  ? "Alleen jij"
                                  : i.visibility === "shared"
                                    ? "Huishouden"
                                    : "Geselecteerde personen"}
                                {i.due_at && (
                                  <>
                                    <b>·</b>
                                    <time
                                      className={
                                        i.status === "open" &&
                                        new Date(i.due_at) < new Date()
                                          ? "overdue"
                                          : ""
                                      }
                                    >
                                      {fmt(i.due_at)}
                                    </time>
                                  </>
                                )}
                              </span>
                            </button>
                            {i.priority === "high" && (
                              <span className="priority">Prioriteit</span>
                            )}
                            <span className="row-arrow">
                              <Icon name="arrow" />
                            </span>
                          </article>
                        ))
                    ) : (
                      <div className="empty">
                        <Icon
                          name={view === "calendar" ? "calendar" : "check"}
                        />
                        <h3>
                          {search ? "Niets gevonden." : "Een beetje ruimte."}
                        </h3>
                        <p>
                          {search
                            ? "Probeer een andere zoekterm."
                            : "Voeg iets toe dat je niet wilt vergeten."}
                        </p>
                        <button
                          className="text-button"
                          onClick={() =>
                            add(
                              view === "calendar"
                                ? "event"
                                : view === "reminders"
                                  ? "reminder"
                                  : "task",
                            )
                          }
                        >
                          + Voeg je eerste item toe
                        </button>
                      </div>
                    )}
                  </div>
                  <footer className="panel-footer">
                    Jouw tempo is een goed tempo.
                    <span>
                      {cloud
                        ? "Veilig met je account"
                        : "Automatisch bewaard op dit apparaat"}
                    </span>
                  </footer>
                </section>
                <aside className="right-column">
                  <section className="panel upcoming">
                    <div className="section-heading">
                      <Icon name="calendar" />
                      <h2>Binnenkort</h2>
                    </div>
                    {open
                      .filter((i) => i.due_at)
                      .sort((a, b) => a.due_at.localeCompare(b.due_at))
                      .slice(0, 3)
                      .map((i) => (
                        <button
                          className="upcoming-item"
                          key={i.id}
                          onClick={() => setDraft(i)}
                        >
                          <span className="date-box">
                            {new Date(i.due_at).getDate()}
                            <small>
                              {new Date(i.due_at).toLocaleDateString("nl-NL", {
                                month: "short",
                              })}
                            </small>
                          </span>
                          <span>
                            <strong>{i.title}</strong>
                            <small>{fmt(i.due_at)}</small>
                          </span>
                        </button>
                      ))}
                    {!open.some((i) => i.due_at) && (
                      <p>Je agenda heeft nog alle ruimte.</p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => {
                        setView("calendar");
                        setFilter("open");
                      }}
                    >
                      Bekijk je agenda <Icon name="arrow" />
                    </button>
                  </section>
                  <section className="privacy-card">
                    <span className="mini-mark">alleen / samen</span>
                    <h2>
                      Een plek voor jullie.
                      <br />
                      En voor jezelf.
                    </h2>
                    <p>
                      Nieuwe items zijn standaard privé. Jij kiest bewust wat je
                      deelt.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setView("settings")}
                    >
                      Jouw instellingen <Icon name="arrow" />
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}
          <footer className="bottom-note">
            todo. <span>Wat vandaag niet lukt, mag morgen.</span>
          </footer>
        </div>
      </main>
      {draft && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setDraft(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
          >
            <div className="section-heading">
              <h2 id="edit-title">
                {items.some((i) => i.id === draft.id)
                  ? "Even bijwerken"
                  : "Iets om te onthouden"}
              </h2>
              <button
                className="close"
                aria-label="Sluiten"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                <Icon name="plus" rotate={45} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={busy || (cloud && draft.owner_id !== user)}>
                <label>
                  Soort
                  <select
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        kind: e.target.value as Item["kind"],
                      })
                    }
                  >
                    {Object.entries(labels).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Titel
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Notities
                  <textarea
                    maxLength={5000}
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </label>
                <ChecklistEditor
                  value={draft.checklist || []}
                  onChange={(checklist) => setDraft({ ...draft, checklist })}
                />
                <div className="form-grid">
                  <label>
                    Categorie
                    <input
                      value={draft.category}
                      maxLength={80}
                      placeholder="Bijvoorbeeld: thuis"
                      onChange={(e) =>
                        setDraft({ ...draft, category: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Prioriteit
                    <select
                      value={draft.priority}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          priority: e.target.value as Item["priority"],
                        })
                      }
                    >
                      <option value="low">Laag</option>
                      <option value="normal">Normaal</option>
                      <option value="high">Hoog</option>
                    </select>
                  </label>
                  <label>
                    {draft.kind === "task" ? "Streefdatum" : "Begintijd"}
                    <input
                      type="datetime-local"
                      required={draft.kind !== "task"}
                      value={localDate(draft.due_at)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          due_at: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : "",
                        })
                      }
                    />
                  </label>
                  {draft.kind === "event" && (
                    <label>
                      Eindtijd
                      <input
                        type="datetime-local"
                        value={localDate(draft.end_at)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            end_at: e.target.value
                              ? new Date(e.target.value).toISOString()
                              : "",
                          })
                        }
                      />
                    </label>
                  )}
                </div>
                <p className="hint">
                  Tijden in {draft.timezone}; getoond in de tijdzone van dit
                  apparaat.
                </p>
                <label>
                  Locatie
                  <input
                    maxLength={500}
                    value={draft.location}
                    onChange={(e) =>
                      setDraft({ ...draft, location: e.target.value })
                    }
                  />
                </label>
                <label>
                  Zichtbaarheid
                  <select
                    value={draft.visibility}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        visibility: e.target.value as Item["visibility"],
                        assignees: [],
                        selected_users: [],
                      })
                    }
                  >
                    <option value="private">Privé — alleen jij</option>
                    <option value="shared" disabled={!cloud || !household}>
                      Gedeeld — hele huishouden
                    </option>
                    <option value="selected" disabled={!cloud || !household}>
                      Geselecteerde personen
                    </option>
                  </select>
                </label>
                {draft.visibility === "selected" && (
                  <div className="people">
                    <span>Delen met</span>
                    {members
                      .filter((m) => m.user_id !== user)
                      .map((m) => (
                        <label key={m.user_id}>
                          <input
                            type="checkbox"
                            checked={draft.selected_users.includes(m.user_id)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                selected_users: e.target.checked
                                  ? [...draft.selected_users, m.user_id]
                                  : draft.selected_users.filter(
                                      (id) => id !== m.user_id,
                                    ),
                              })
                            }
                          />
                          {m.display_name}
                        </label>
                      ))}
                  </div>
                )}
                {members.length > 0 && (
                  <div className="people">
                    <span>Toewijzen (optioneel)</span>
                    {members
                      .filter(
                        (m) =>
                          m.user_id === user ||
                          draft.visibility === "shared" ||
                          draft.selected_users.includes(m.user_id),
                      )
                      .map((m) => (
                        <label key={m.user_id}>
                          <input
                            type="checkbox"
                            checked={draft.assignees.includes(m.user_id)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                assignees: e.target.checked
                                  ? [...draft.assignees, m.user_id]
                                  : draft.assignees.filter(
                                      (id) => id !== m.user_id,
                                    ),
                              })
                            }
                          />
                          {m.display_name}
                        </label>
                      ))}
                  </div>
                )}
              </fieldset>
              {draft.location && (
                <a
                  className="map-link"
                  href={mapLink(draft.location, provider)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open locatie in navigatie <Icon name="arrow" />
                </a>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                {(!cloud || draft.owner_id === user) && (
                  <>
                    <button className="primary" disabled={busy}>
                      {busy ? "Opslaan…" : "Opslaan"}
                    </button>
                    {items.some((i) => i.id === draft.id) && (
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void remove(draft)}
                      >
                        Verwijderen
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Sluiten
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {captureOpen && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-title"
          >
            <div className="section-heading">
              <h2 id="capture-title">Van je hoofd naar je lijst.</h2>
              <button
                className="close"
                aria-label="Sluiten"
                onClick={() => setCaptureOpen(false)}
              >
                <Icon name="plus" rotate={45} />
              </button>
            </div>
            <p>Plak een bericht. Je controleert het concept altijd zelf.</p>
            <label>
              Tekst uit je bericht
              <textarea
                autoFocus
                value={capture}
                onChange={(e) => setCapture(e.target.value)}
                placeholder="Tandarts op 30-10-2026 om 17:00"
              />
            </label>
            <button
              className="primary"
              disabled={!capture.trim()}
              onClick={() => {
                const parsed = parseCapture(capture);
                setDraft({
                  ...blankItem(user, household),
                  title: parsed.title,
                  description: capture,
                  due_at: parsed.due,
                });
                setNotice(parsed.warning);
                setCaptureOpen(false);
                setCapture("");
              }}
            >
              Concept bekijken
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
