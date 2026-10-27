"use client";
import { useEffect, useRef, useState } from "react";
import { ZodError } from "zod";
import { localBackup } from "@/lib/backup";
import { supabase } from "@/lib/supabase";
import {
  blankItem,
  readItem,
  itemForDatabase,
  prepareRepeat,
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
import {
  noteDraft,
  noteSchema,
  Note,
  ItemTemplate,
  templateFromItem,
  instantiateTemplate,
  restorePrivately,
  assigneeLabel,
} from "@/lib/workspace";
import {
  eventInstances,
  occurrenceAt,
  normalizedEvent,
  nextDay,
  frequencies,
  Occurrence,
} from "@/lib/schedule";
import EventFields from "@/components/EventFields";
import AgendaSpace from "@/components/AgendaSpace";
import ShoppingList from "@/components/ShoppingList";
import McpConsent from "@/components/McpConsent";
import McpProposal from "@/components/McpProposal";
import McpSettings from "@/components/McpSettings";
import ConnectionSettings from "@/components/ConnectionSettings";
import {
  connectorRequest,
  Integration,
  providerLabels,
} from "@/lib/connections";
import DeviceStatus from "@/components/DeviceStatus";
import WeeklyReview from "@/components/WeeklyReview";
import PersonalInbox from "@/components/PersonalInbox";
import WorkspaceSettings from "@/components/WorkspaceSettings";
import CalendarImport from "@/components/CalendarImport";
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
  const [allItems, setItems] = useState<Item[]>([]),
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
  const items = allItems.filter((i) => !i.deleted_at);
  const [serverTrash, setServerTrash] = useState<Item[]>([]);
  const [undo, setUndo] = useState<
    { kind: "item"; id: string } | { kind: "note"; note: Note } | null
  >(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteFilter, setNoteFilter] = useState("all");
  const [itemPages, setItemPages] = useState(1),
    [itemTotal, setItemTotal] = useState(0);
  const [noteOffset, setNoteOffset] = useState(0),
    [noteTotal, setNoteTotal] = useState(0),
    [pendingNoteTotal, setPendingNoteTotal] = useState(0),
    [trashOffset, setTrashOffset] = useState(0);
  const [templates, setTemplates] = useState<ItemTemplate[]>([]);
  const [handled, setHandled] = useState<string[]>([]);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState<{
    index: number;
    version: string;
  } | null>(null);
  const [editOccurrence, setEditOccurrence] = useState(false);
  const trashed = supabase ? serverTrash : allItems.filter((i) => i.deleted_at);
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
  const pendingConnector = useRef<{ code: string; state: string } | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [writeTarget, setWriteTarget] = useState("todo");
  const [mcpConsent, setMcpConsent] = useState<string | null>(null),
    [mcpProposal, setMcpProposal] = useState<string | null>(null);
  const cloud = !!supabase;
  const requests = useRef(new SessionRequests());
  const identity = useRef("");
  async function load(uid: string) {
    const client = supabase;
    if (!client) return;
    async function itemPageData() {
      const results = await Promise.all(
        Array.from({ length: itemPages }, (_, page) =>
          client!
            .from("items")
            .select("*", { count: page === 0 ? "exact" : undefined })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(page * 1000, (page + 1) * 1000 - 1),
        ),
      );
      return {
        data: results.flatMap((r) => r.data || []),
        error: results.find((r) => r.error)?.error || null,
        count: results[0].count,
      };
    }
    await requests.current.run(
      uid,
      async () => {
        const [
          rows,
          member,
          inbox,
          prefs,
          briefPrefs,
          trashRows,
          noteRows,
          templateRows,
          inboxStates,
          connections,
        ] = await Promise.all([
          itemPageData(),
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
          client.rpc("trash_page", { row_offset: trashOffset }),
          client.rpc("note_page", {
            row_offset: noteOffset,
            note_state: noteFilter,
          }),
          client
            .from("item_templates")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200),
          client
            .from("item_inbox_state")
            .select("item_id,handled")
            .eq("user_id", uid),
          client.from("integrations").select("*").eq("user_id", uid),
        ]);
        if (rows.error) throw rows.error;
        for (const result of [trashRows, noteRows, templateRows, inboxStates])
          if (result.error) throw result.error;
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
        if (connections.error) throw connections.error;
        return {
          itemTotal: rows.count ?? rows.data?.length ?? 0,
          connections: (connections.data || []) as Integration[],
          items: (rows.data || []).map((i) => readItem(i)),
          household: member.data?.household_id || null,
          trash: (trashRows.data || []).map((i: Item) => ({
            ...i,
            due_at: i.due_at || "",
            end_at: i.end_at || "",
          })),
          notes: (noteRows.data?.items || []).map((n: unknown) =>
            noteSchema.parse(n),
          ),
          noteTotal: noteRows.data?.total || 0,
          pendingNoteTotal: noteRows.data?.pending || 0,
          templates: (templateRows.data || []) as ItemTemplate[],
          handled: (inboxStates.data || [])
            .filter((i: { handled: boolean }) => i.handled)
            .map((i: { item_id: string }) => i.item_id),
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
        setItemTotal(data.itemTotal);
        setIntegrations(data.connections);
        setServerTrash(data.trash);
        setNotes(data.notes);
        setNoteTotal(data.noteTotal);
        setPendingNoteTotal(data.pendingNoteTotal);
        setTemplates(data.templates);
        setHandled(data.handled);
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
    for (const [param, set] of [
      ["mcp_request", setMcpConsent],
      ["mcp_proposal", setMcpProposal],
    ] as const) {
      const value = incoming.searchParams.get(param);
      if (value && /^[0-9a-f-]{36}$/i.test(value)) set(value);
      incoming.searchParams.delete(param);
    }
    history.replaceState(
      null,
      "",
      incoming.pathname + incoming.search + incoming.hash,
    );
    const oauthState = incoming.searchParams.get("state");
    if (
      oauthState &&
      /^(google_calendar|gmail|outlook_calendar)\./.test(oauthState)
    ) {
      const code = incoming.searchParams.get("code");
      if (code) pendingConnector.current = { code, state: oauthState };
      else setError("Aanmelden bij de provider is geannuleerd of mislukt.");
      for (const name of [
        "code",
        "state",
        "scope",
        "error",
        "error_description",
        "session_state",
        "authuser",
        "prompt",
      ])
        incoming.searchParams.delete(name);
      history.replaceState(
        null,
        "",
        incoming.pathname + incoming.search + incoming.hash,
      );
    }
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
        const savedNotes = localStorage.getItem("todo-device-notes");
        if (savedNotes)
          setNotes(
            JSON.parse(savedNotes).map((n: unknown) => noteSchema.parse(n)),
          );
        const savedTemplates = localStorage.getItem("todo-device-templates");
        if (savedTemplates) setTemplates(JSON.parse(savedTemplates));
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
        setIntegrations([]);
        setWriteTarget("todo");
        setNoteOffset(0);
        setTrashOffset(0);
        setNoteTotal(0);
        setPendingNoteTotal(0);
        setEmail("");
        setName("");
        setHouseName("Ons huishouden");
        setNoteFilter("all");
        setNoteOffset(0);
        setTrashOffset(0);
        setNoteTotal(0);
        setPendingNoteTotal(0);
        setItemPages(1);
        setItemTotal(0);
        setServerTrash([]);
        setNotes([]);
        setTemplates([]);
        setHandled([]);
        setUndo(null);
        setDraftNote(null);
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
  useEffect(() => {
    if (signedIn) void load(user).catch((e) => setError(e.message));
  }, [noteOffset, trashOffset, noteFilter, itemPages]);
  useEffect(() => {
    if (!signedIn || !pendingConnector.current) return;
    const callback = pendingConnector.current;
    pendingConnector.current = null;
    void action(async () => {
      await connectorRequest({ action: "callback", ...callback });
      await load(user);
      setView("settings");
      setNotice("Account verbonden. Kies bij Instellingen je agenda’s.");
    });
  }, [signedIn, user]);
  useEffect(() => {
    if (!draft) {
      setDraftNote(null);
      setSelectedOccurrence(null);
      setEditOccurrence(false);
    }
  }, [draft]);
  function openItem(i: Item) {
    const occurrence = i as Occurrence;
    setDraftNote(null);
    setSelectedOccurrence(
      occurrence.occurrence_index === undefined
        ? null
        : {
            index: occurrence.occurrence_index,
            version: occurrence.series_version || i.updated_at,
          },
    );
    setEditOccurrence(occurrence.occurrence_index !== undefined);
    setDraft(i);
  }
  async function setException(
    root: Item,
    index: number,
    change: unknown,
    version: string,
  ) {
    if (supabase) {
      const r = await supabase.rpc("calendar_exception", {
        item_id: root.id,
        occurrence: index,
        change,
        expected_updated_at: version,
      });
      if (r.error) throw r.error;
      await load(user);
    } else {
      const entries = root.schedule_exceptions.filter((e) => e.index !== index);
      if (change)
        entries.push({
          ...(change as Item["schedule_exceptions"][number]),
          index,
        });
      persist(
        items.map((i) =>
          i.id === root.id
            ? {
                ...root,
                schedule_exceptions: entries,
                updated_at: new Date().toISOString(),
              }
            : i,
        ),
      );
    }
  }
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 12000);
    return () => clearTimeout(t);
  }, [undo]);
  function storeLocalNotes(next: Note[]) {
    localStorage.setItem("todo-device-notes", JSON.stringify(next));
    setNotes(next);
  }
  async function createNote(
    body: string,
    source: Note["source_type"] = "text",
  ) {
    return action(async () => {
      const n = noteDraft(user, body, source);
      if (supabase) {
        const r = await supabase.from("inbox_notes").insert(n);
        if (r.error) throw r.error;
        await load(user);
      } else storeLocalNotes([n, ...notes]);
      setNotice("Notitie bewaard in je persoonlijke inbox.");
    });
  }
  async function updateNote(note: Note, state: Note["state"]) {
    if (
      state === "trash" &&
      !confirm("Weet je zeker dat je deze notitie wilt verwijderen?")
    )
      return;
    await action(async () => {
      if (supabase) {
        const r = await supabase
          .from("inbox_notes")
          .update({ state })
          .eq("id", note.id)
          .select("id")
          .single();
        if (r.error) throw r.error;
        await load(user);
      } else
        storeLocalNotes(
          notes.map((n) => (n.id === note.id ? { ...n, state } : n)),
        );
      setUndo(state === "trash" ? { kind: "note", note } : null);
    });
  }
  async function purgeNote(note: Note) {
    if (
      !confirm(
        "Deze notitie definitief verwijderen? Dit kan niet ongedaan worden gemaakt.",
      )
    )
      return;
    await action(async () => {
      if (supabase) {
        const r = await supabase
          .from("inbox_notes")
          .delete()
          .eq("id", note.id)
          .eq("state", "trash")
          .select("id")
          .single();
        if (r.error) throw Error("Notitie niet verwijderd. Vernieuw eerst.");
        await load(user);
      } else storeLocalNotes(notes.filter((n) => n.id !== note.id));
      setUndo(null);
    });
  }
  async function handleInbox(id: string) {
    await action(async () => {
      if (supabase) {
        const r = await supabase
          .from("item_inbox_state")
          .upsert({ user_id: user, item_id: id, handled: true });
        if (r.error) throw r.error;
      }
      setHandled([...handled, id]);
    });
  }
  async function restoreItem(id: string) {
    await action(async () => {
      if (supabase) {
        const r = await supabase.rpc("restore_item", { item_id: id });
        if (r.error) throw r.error;
        await load(user);
      } else {
        const i = allItems.find((i) => i.id === id);
        if (!i) throw Error("Item niet gevonden");
        persist([restorePrivately(i), ...items.filter((i) => i.id !== id)]);
      }
      setUndo(null);
      setNotice("Hersteld als privé-item. Deel het opnieuw als je dat wilt.");
    });
  }
  async function purgeItem(id: string) {
    if (
      !confirm(
        "Weet je zeker dat je dit item definitief wilt verwijderen? Dit kan niet ongedaan worden gemaakt.",
      )
    )
      return;
    await action(async () => {
      if (supabase) {
        const r = await supabase.rpc("purge_item", { item_id: id });
        if (r.error) throw r.error;
        await load(user);
      } else {
        const next = allItems.filter((i) => i.id !== id);
        localStorage.setItem(key, JSON.stringify(next));
        setItems(next);
      }
    });
  }
  async function saveTemplate(item: Item) {
    await action(async () => {
      const t = templateFromItem(itemSchema.parse(item), user);
      if (supabase) {
        const r = await supabase.from("item_templates").insert(t);
        if (r.error) throw r.error;
        await load(user);
      } else {
        const next = [t, ...templates];
        localStorage.setItem("todo-device-templates", JSON.stringify(next));
        setTemplates(next);
      }
      setNotice("Sjabloon bewaard zonder oude deelrechten.");
    });
  }
  async function deleteTemplate(id: string) {
    if (!confirm("Weet je zeker dat je dit sjabloon wilt verwijderen?")) return;
    await action(async () => {
      if (supabase) {
        const r = await supabase.from("item_templates").delete().eq("id", id);
        if (r.error) throw r.error;
        await load(user);
      } else {
        const next = templates.filter((t) => t.id !== id);
        localStorage.setItem("todo-device-templates", JSON.stringify(next));
        setTemplates(next);
      }
    });
  }
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
      return true;
    } catch (e) {
      setError(
        e instanceof ZodError
          ? e.issues.map((issue) => issue.message).join(" ")
          : e instanceof Error
            ? e.message
            : "Er ging iets mis. Probeer opnieuw.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function persist(next: Item[]) {
    const ids = new Set(next.map((i) => i.id));
    const merged = [
      ...next,
      ...allItems.filter((i) => i.deleted_at && !ids.has(i.id)),
    ];
    localStorage.setItem(key, JSON.stringify(merged));
    setItems(merged);
  }
  async function importCalendar(incoming: Item[]): Promise<number> {
    if (!incoming.length || incoming.length > 100)
      throw Error("Kies maximaal 100 afspraken.");
    const values = incoming.map((i) =>
      itemSchema.parse({
        ...i,
        owner_id: user,
        household_id: household,
        visibility: "private",
        assignees: [],
        selected_users: [],
        kind: "event",
        repeat_kind: "none",
        repeat_anchor: null,
        repeat_index: 0,
        repeat_source: null,
      }),
    );
    if (values.some((i) => !i.import_uid))
      throw Error("De afspraak mist een importkenmerk.");
    if (supabase) {
      const result = await supabase
        .from("items")
        .upsert(
          values.map((i) => itemForDatabase(i)),
          { onConflict: "owner_id,import_uid", ignoreDuplicates: true },
        )
        .select("id");
      if (result.error)
        throw Error(
          "Importeren is niet gelukt. Er is niets toegevoegd. Probeer opnieuw.",
        );
      await load(user);
      return result.data?.length || 0;
    }
    const existing = new Set(items.map((i) => i.import_uid).filter(Boolean));
    const fresh = values.filter((i) => !existing.has(i.import_uid));
    persist([...fresh, ...items]);
    return fresh.length;
  }
  async function commitAI(raw: AIProposal) {
    const proposal = aiProposalSchema.parse(raw);
    if (proposal.action === "note_create") {
      if (!supabase) throw Error("Log eerst in.");
      const r = await supabase.from("inbox_notes").insert({
        user_id: user,
        body: proposal.body,
        source_type: "voice",
        state: "inbox",
      });
      if (r.error) throw Error("Notitie bewaren is niet gelukt.");
      await load(user);
    } else if (proposal.action === "create") {
      const valid = itemSchema.parse({
        ...blankItem(user, household, proposal.item.kind),
        ...proposal.item,
      });
      if (supabase) {
        const r = await supabase
          .from("items")
          .insert(itemForDatabase(valid))
          .select("id")
          .single();
        if (r.error) throw Error("Toevoegen is niet gelukt. Probeer opnieuw.");
        await load(user);
      } else persist([valid, ...items]);
    } else {
      if (!supabase) throw Error("Log eerst in.");
      const source = items.find(
        (i) => i.id === proposal.id && i.integration_id,
      );
      if (source) {
        if (proposal.action === "complete")
          throw Error("Externe afspraken kun je niet afronden.");
        if (
          !confirm(
            "Deze actie wijzigt of verwijdert de afspraak in de oorspronkelijke agenda. Deelnemers kunnen een bericht ontvangen. Doorgaan?",
          )
        )
          throw Error("Niet uitgevoerd.");
        const updated =
          proposal.action === "update"
            ? normalizedEvent(
                itemSchema.parse({ ...source, ...proposal.patch }),
              )
            : source;
        await connectorRequest({
          action: proposal.action,
          id: source.integration_id,
          item_id: source.id,
          expected_updated_at: proposal.expected_updated_at,
          item: updated,
          confirmed_external_effects: true,
        });
        await load(user);
        return;
      }
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
        const r = await supabase.rpc("trash_item", {
          item_id: proposal.id,
          expected_updated_at: proposal.expected_updated_at,
        });
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
          ...readItem(current.data),
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
      let valid = normalizedEvent(
        itemSchema.parse({ ...draft, updated_at: new Date().toISOString() }),
      );
      if (
        valid.integration_id ||
        (valid.kind === "event" &&
          writeTarget !== "todo" &&
          !items.some((i) => i.id === valid.id))
      ) {
        const sourceId = valid.integration_id || writeTarget.split("|")[0],
          calendarId =
            valid.source_calendar_id ||
            writeTarget.slice(writeTarget.indexOf("|") + 1);
        if (
          !confirm(
            "Deze afspraak opslaan in de externe agenda? Wijzigingen kunnen ook deelnemers informeren.",
          )
        )
          return;
        const response = await connectorRequest({
          action: valid.integration_id ? "update" : "create",
          id: sourceId,
          calendar_id: calendarId,
          item_id: valid.id,
          request_id: draftNote || valid.id,
          note_id: draftNote,
          expected_updated_at: draft.updated_at,
          item: valid,
          confirmed_external_effects: true,
        });
        await load(user);
        setDraft(null);
        setWriteTarget("todo");
        setNotice(
          response.refresh_pending
            ? response.message
            : "Opgeslagen in de gekozen bronagenda.",
        );
        return;
      }
      if (editOccurrence && selectedOccurrence) {
        const root = items.find((i) => i.id === draft.id);
        if (!root) throw Error("Reeks niet gevonden");
        const patch = {
          title: valid.title,
          description: valid.description,
          location: valid.location,
          due_at: valid.due_at,
          end_at: valid.end_at || null,
          all_day: valid.all_day,
          start_date: valid.start_date || null,
          end_date: valid.end_date || null,
          timezone: valid.timezone,
          busy: valid.busy,
        };
        await setException(
          root,
          selectedOccurrence.index,
          { cancelled: false, patch },
          selectedOccurrence.version,
        );
        setDraft(null);
        setNotice("Dit moment in de reeks is aangepast.");
        return;
      }

      if (supabase) {
        const payload = itemForDatabase(
          valid,
          items.some((i) => i.id === valid.id),
        );
        const exists = items.some((i) => i.id === valid.id);
        const result = draftNote
          ? await supabase.rpc("convert_note", {
              note_id: draftNote,
              new_item: payload,
            })
          : exists
            ? await supabase
                .from("items")
                .update(payload)
                .eq("id", valid.id)
                .eq("updated_at", draft.updated_at)
                .select("id")
                .single()
            : await supabase
                .from("items")
                .insert(payload)
                .select("id")
                .single();
        if (result.error) throw result.error;
        await load(user);
      } else {
        valid = prepareRepeat(
          valid,
          items.find((i) => i.id === valid.id),
        );
        persist([valid, ...items.filter((i) => i.id !== valid.id)]);
        if (draftNote)
          storeLocalNotes(
            notes.map((n) =>
              n.id === draftNote
                ? { ...n, state: "converted", converted_item_id: valid.id }
                : n,
            ),
          );
      }
      setDraftNote(null);
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
      } else {
        const complete = (await import("@/lib/repeat")).completeLocal;
        persist(complete(items, i, i.status !== "done"));
      }
    });
  }
  async function remove(i: Item) {
    const c = i.integration_id
      ? integrations.find((c) => c.id === i.integration_id)
      : null;
    const externalWrite = !!(
      c?.enabled && c.write_calendar_ids?.includes(i.source_calendar_id || "")
    );
    if (
      !confirm(
        externalWrite
          ? `Weet je zeker dat je “${i.title}” ook in de bronagenda wilt verwijderen? Dit kan deelnemers informeren. Herstel in de bron is daarna niet automatisch mogelijk.`
          : i.integration_id
            ? `Weet je zeker dat je “${i.title}” in Todo wilt verbergen? De bronafspraak blijft bestaan.`
            : `Weet je zeker dat je “${i.title}” wilt verwijderen? Het komt in je prullenbak.`,
      )
    )
      return;
    await action(async () => {
      if (externalWrite) {
        const response = await connectorRequest({
          action: "delete",
          id: i.integration_id,
          item_id: i.id,
          expected_updated_at: i.updated_at,
          confirmed_external_effects: true,
        });
        await load(user);
        setDraft(null);
        setNotice(
          response.refresh_pending
            ? response.message
            : "Verwijderd in de bronagenda.",
        );
        return;
      }
      if (editOccurrence && selectedOccurrence) {
        const root = items.find((x) => x.id === i.id);
        if (!root) throw Error("Reeks niet gevonden");
        await setException(
          root,
          selectedOccurrence.index,
          { cancelled: true },
          selectedOccurrence.version,
        );
        setDraft(null);
        setNotice(
          "Dit moment is overgeslagen. Je kunt het herstellen vanuit de reeks.",
        );
        return;
      }
      if (supabase) {
        const r = await supabase.rpc("trash_item", {
          item_id: i.id,
          expected_updated_at: i.updated_at,
        });
        if (r.error) throw r.error;
        await load(user);
      } else
        persist([
          ...items.filter((x) => x.id !== i.id),
          { ...i, deleted_at: new Date().toISOString() },
        ]);
      setUndo({ kind: "item", id: i.id });
      setNotice("Verplaatst naar je prullenbak.");
      setDraft(null);
    });
  }
  function add(kind: Item["kind"] = "task") {
    setError("");
    const item = blankItem(user, household, kind);
    if (kind === "event" && view === "calendar") {
      const day = calendarDay || new Date().toLocaleDateString("sv-SE");
      item.due_at = new Date(day + "T09:00:00").toISOString();
    }
    setDraftNote(null);
    setWriteTarget("todo");
    setDraft(item);
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
  async function exportData() {
    let exportedItems = allItems,
      exportedNotes = notes;
    if (supabase) {
      exportedItems = [];
      exportedNotes = [];
      for (let offset = 0; ; offset += 1000) {
        const r = await supabase
          .from("items")
          .select("*")
          .order("id")
          .range(offset, offset + 999);
        if (r.error) throw Error("Back-up ophalen mislukt.");
        exportedItems.push(...(r.data || []).map(readItem));
        if ((r.data || []).length < 1000) break;
      }
      for (let offset = 0; ; offset += 100) {
        const r = await supabase.rpc("note_page", {
          row_offset: offset,
          note_state: "all",
        });
        if (r.error) throw Error("Notities ophalen mislukt.");
        const page = r.data?.items || [];
        exportedNotes.push(...page.map((n: unknown) => noteSchema.parse(n)));
        if (page.length < 100) break;
      }
    }
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: 2,
              items: exportedItems,
              notes: exportedNotes,
              templates,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
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
  const dayStart = new Date(
    (calendarDay || new Date().toLocaleDateString("sv-SE")) + "T00:00:00",
  );
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + (calendarDay ? 1 : 30));
  let displayItems: Item[] = items;
  if (view === "calendar") {
    try {
      displayItems = items
        .filter((i) => i.kind === "event")
        .flatMap((i) =>
          !calendarDay && i.schedule_kind === "none"
            ? [i]
            : eventInstances(i, dayStart, dayEnd),
        );
    } catch {
      displayItems = [];
    }
  }
  const shown = displayItems
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
  const draftConnection = draft?.integration_id
    ? integrations.find((c) => c.id === draft.integration_id)
    : null;
  const canEditDraft =
    !draft?.integration_id ||
    !!(
      draftConnection?.enabled &&
      draftConnection.write_calendar_ids?.includes(
        draft.source_calendar_id || "",
      )
    );
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
            {view !== "settings" &&
              view !== "assistant" &&
              view !== "calendar" && (
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
          {cloud && signedIn && items.length < itemTotal && (
            <div className="alert" role="status">
              {items.length} van {itemTotal} zichtbare items opgehaald. Je
              overzicht kan nog onvolledig zijn.{" "}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setItemPages(itemPages + 1)}
              >
                Meer items ophalen
              </button>
            </div>
          )}
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
          {undo && (
            <div className="alert" role="status">
              Item naar de prullenbak.{" "}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (undo.kind === "item") void restoreItem(undo.id);
                  else void updateNote(undo.note, undo.note.state);
                }}
              >
                Ongedaan maken
              </button>
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
                        options: {
                          emailRedirectTo: window.location.origin + "/",
                        },
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
                      const r = await supabase!.auth.resend({
                        type: "signup",
                        email,
                        options: {
                          emailRedirectTo: window.location.origin + "/",
                        },
                      });
                      if (r.error)
                        throw Error(
                          "Aanvragen kan nu niet. Wacht even en probeer opnieuw.",
                        );
                      setNotice(
                        "Als je account nog bevestigd moet worden, ontvang je een nieuwe bevestigingsmail.",
                      );
                    })
                  }
                >
                  Bevestigingsmail opnieuw aanvragen
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      if (!email) throw Error("Vul eerst je e-mailadres in.");
                      const r = await supabase!.auth.resetPasswordForEmail(
                        email,
                        { redirectTo: window.location.origin + "/" },
                      );
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
          ) : mcpConsent && signedIn ? (
            <McpConsent
              key={`${user}:${mcpConsent}`}
              id={mcpConsent}
              onClose={() => setMcpConsent(null)}
            />
          ) : mcpProposal && signedIn ? (
            <McpProposal
              key={`${user}:${mcpProposal}`}
              id={mcpProposal}
              onClose={() => {
                setMcpProposal(null);
                setView("today");
              }}
              onChanged={() => load(user)}
              onEdit={(proposal) => {
                const raw = proposal.payload.item;
                const item = itemSchema.parse({
                  ...raw,
                  due_at: raw.due_at || "",
                  end_at: raw.end_at || "",
                  start_date: raw.start_date || "",
                  end_date: raw.end_date || "",
                  schedule_until: raw.schedule_until || "",
                });
                setMcpProposal(null);
                setDraft(item);
              }}
            />
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
                <button
                  className="secondary"
                  onClick={() => void action(exportData)}
                >
                  JSON-back-up downloaden
                </button>
                <button className="secondary" onClick={exportCalendar}>
                  Agenda downloaden (.ics)
                </button>
                <ConnectionSettings
                  key={user}
                  user={user}
                  onChange={() => load(user)}
                  onConnections={setIntegrations}
                />
                <McpSettings key={`mcp-${user}`} />
                <DeviceStatus key={user} />
                {cloud && (
                  <label>
                    Notities bekijken
                    <select
                      value={noteFilter}
                      onChange={(e) => {
                        setNoteOffset(0);
                        setNoteFilter(e.target.value);
                      }}
                    >
                      {Object.entries({
                        all: "Alle notities",
                        inbox: "Onverwerkt",
                        kept: "Bewaard",
                        converted: "Verwerkt",
                        trash: "Verwijderd",
                      }).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {cloud && noteTotal > 100 && (
                  <div className="assistant-actions">
                    <span>
                      Notities {noteOffset + 1}–
                      {Math.min(noteOffset + 100, noteTotal)} van {noteTotal}
                    </span>
                    <button
                      className="text-button"
                      disabled={busy || noteOffset === 0}
                      onClick={() =>
                        setNoteOffset(Math.max(0, noteOffset - 100))
                      }
                    >
                      Vorige notities
                    </button>
                    <button
                      className="text-button"
                      disabled={busy || noteOffset + 100 >= noteTotal}
                      onClick={() => setNoteOffset(noteOffset + 100)}
                    >
                      Volgende notities
                    </button>
                  </div>
                )}
                <WorkspaceSettings
                  user={user}
                  trash={trashed}
                  notes={notes}
                  templates={templates}
                  busy={busy}
                  onRestore={(id) => void restoreItem(id)}
                  onPurge={(id) => void purgeItem(id)}
                  onNoteState={(n, state) => void updateNote(n, state)}
                  onPurgeNote={(n) => void purgeNote(n)}
                  onTemplate={(t) => {
                    setDraftNote(null);
                    setDraft(instantiateTemplate(t, user, household));
                  }}
                  onDeleteTemplate={(id) => void deleteTemplate(id)}
                />
                {cloud && (
                  <div className="assistant-actions">
                    <button
                      className="text-button"
                      disabled={busy || trashOffset === 0}
                      onClick={() =>
                        setTrashOffset(Math.max(0, trashOffset - 50))
                      }
                    >
                      Vorige verwijderde items
                    </button>
                    <button
                      className="text-button"
                      disabled={busy || trashed.length < 50}
                      onClick={() => setTrashOffset(trashOffset + 50)}
                    >
                      Volgende verwijderde items
                    </button>
                  </div>
                )}
                <CalendarImport
                  key={user}
                  user={user}
                  household={household}
                  existing={items}
                  busy={busy}
                  onImport={importCalendar}
                />
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
                            const parsed = localBackup(
                              JSON.parse(await file.text()),
                            );
                            if (
                              !confirm(
                                "Huidige lokale gegevens vervangen door deze back-up?",
                              )
                            )
                              return;
                            localStorage.setItem(
                              key,
                              JSON.stringify(parsed.items),
                            );
                            setItems(parsed.items);
                            if (parsed.notes) storeLocalNotes(parsed.notes);
                            if (parsed.templates) {
                              localStorage.setItem(
                                "todo-device-templates",
                                JSON.stringify(parsed.templates),
                              );
                              setTemplates(parsed.templates);
                            }
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
                  key={user}
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
                  onOpen={openItem}
                  onRefresh={() => void action(() => load(user))}
                />
              )}
              <DueReminders
                key={user}
                items={items}
                enabled={remindersEnabled}
                busy={busy}
                user={user}
                onOpen={openItem}
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
                  onAdd={() => add("event")}
                />
              )}
              {view === "calendar" && (
                <AgendaSpace items={items} day={calendarDay} />
              )}
              {view === "today" && (
                <DayBrief
                  items={items}
                  preferences={briefPreferences}
                  noteCount={
                    cloud
                      ? pendingNoteTotal
                      : notes.filter((n) => n.state === "inbox").length
                  }
                  onOpen={openItem}
                />
              )}
              {view === "today" && briefPreferences.review_enabled && (
                <WeeklyReview
                  items={items}
                  user={user}
                  busy={busy}
                  onKeep={(i) =>
                    void action(async () => {
                      if (supabase) {
                        const r = await supabase
                          .from("items")
                          .update({ reviewed_at: new Date().toISOString() })
                          .eq("id", i.id)
                          .select("id")
                          .single();
                        if (r.error) throw r.error;
                        await load(user);
                      } else
                        persist(
                          items.map((x) =>
                            x.id === i.id
                              ? { ...x, reviewed_at: new Date().toISOString() }
                              : x,
                          ),
                        );
                    })
                  }
                  onPostpone={(i) => {
                    openItem(i);
                    setTimeout(
                      () =>
                        document
                          .querySelector<HTMLInputElement>(
                            'input[type="datetime-local"]',
                          )
                          ?.focus(),
                      0,
                    );
                  }}
                  onRemove={(i) => void remove(i)}
                />
              )}
              {view === "today" && cloud && noteFilter !== "all" && (
                <button
                  className="text-button"
                  onClick={() => {
                    setNoteFilter("all");
                    setNoteOffset(0);
                  }}
                >
                  Toon mijn onverwerkte inbox
                </button>
              )}
              {view === "today" && (
                <PersonalInbox
                  key={user}
                  user={user}
                  notes={notes}
                  items={items}
                  handled={handled}
                  members={members}
                  busy={busy}
                  onCreateNote={(body, source) => createNote(body, source)}
                  onNoteState={(n, state) => void updateNote(n, state)}
                  onConvert={(n, kind) => {
                    const d = blankItem(user, household, kind);
                    d.title = n.body.slice(0, 200);
                    d.description = n.body;
                    setDraftNote(n.id);
                    setDraft(d);
                  }}
                  onOpen={openItem}
                  onHandle={(id) => void handleInbox(id)}
                />
              )}
              {view === "today" && cloud && noteTotal > 100 && (
                <div className="assistant-actions">
                  <button
                    className="text-button"
                    disabled={busy || noteOffset === 0}
                    onClick={() => setNoteOffset(Math.max(0, noteOffset - 100))}
                  >
                    Vorige notities
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || noteOffset + 100 >= noteTotal}
                    onClick={() => setNoteOffset(noteOffset + 100)}
                  >
                    Volgende notities
                  </button>
                  <span>
                    {noteTotal} notities in totaal · {pendingNoteTotal}{" "}
                    onverwerkt
                  </span>
                </div>
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
                        .map((i) =>
                          i.list_type === "shopping" ? (
                            <ShoppingList
                              key={`${user}:${i.id}`}
                              item={i}
                              user={user}
                              members={members}
                              busy={busy}
                              onOpen={() => openItem(i)}
                              onStep={(step_id, step_text, checked) =>
                                action(async () => {
                                  if (supabase) {
                                    const r = await supabase.rpc(
                                      "shopping_step",
                                      {
                                        item_id: i.id,
                                        step_id,
                                        step_text,
                                        checked,
                                      },
                                    );
                                    if (r.error) throw r.error;
                                    await load(user);
                                  } else {
                                    const found = i.checklist.some(
                                      (s) => s.id === step_id,
                                    );
                                    const checklist = found
                                      ? i.checklist.map((s) =>
                                          s.id === step_id
                                            ? { ...s, done: checked ?? s.done }
                                            : s,
                                        )
                                      : [
                                          ...i.checklist,
                                          {
                                            id: step_id,
                                            text: step_text || "",
                                            done: false,
                                          },
                                        ];
                                    persist(
                                      items.map((x) =>
                                        x.id === i.id ? { ...i, checklist } : x,
                                      ),
                                    );
                                  }
                                })
                              }
                            />
                          ) : (
                            <article
                              key={`${i.id}-${(i as Occurrence).occurrence_index ?? "root"}`}
                              className={
                                "task-row " +
                                (i.status === "done" ? "completed" : "")
                              }
                            >
                              {i.integration_id ||
                              i.schedule_kind !== "none" ? (
                                <Icon name="calendar" />
                              ) : (
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
                              )}
                              <button
                                className="task-info"
                                onClick={() => {
                                  setError("");
                                  openItem(i);
                                }}
                              >
                                <strong>{i.title}</strong>
                                <span>
                                  {i.category || labels[i.kind]}
                                  {i.integration_id && (
                                    <span>
                                      {" "}
                                      ·{" "}
                                      {integrations.find(
                                        (c) => c.id === i.integration_id,
                                      )
                                        ? providerLabels[
                                            integrations.find(
                                              (c) => c.id === i.integration_id,
                                            )!.provider
                                          ]
                                        : "Externe agenda"}
                                    </span>
                                  )}
                                  {i.repeat_kind &&
                                    i.repeat_kind !== "none" &&
                                    ` · ${frequencies[i.repeat_kind]}`}
                                  <b>·</b>
                                  {i.visibility === "private"
                                    ? "Alleen jij"
                                    : i.visibility === "shared"
                                      ? "Huishouden"
                                      : "Geselecteerde personen"}
                                  <b>·</b>
                                  {i.assignees.length > 0 && (
                                    <Icon
                                      name={
                                        i.assignees.length > 1
                                          ? "people-together"
                                          : i.assignees.includes(user)
                                            ? "person-me"
                                            : "person-partner"
                                      }
                                    />
                                  )}{" "}
                                  {assigneeLabel(i, user, members)}
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
                                        {i.all_day
                                          ? `${i.start_date} · hele dag`
                                          : fmt(i.due_at)}
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
                          ),
                        )
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
                        {view !== "calendar" && (
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
                        )}
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
                            <small>
                              {i.all_day
                                ? `${i.start_date} · hele dag`
                                : fmt(i.due_at)}
                            </small>
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
              {selectedOccurrence && (
                <div className="assistant-actions" aria-label="Reeks bewerken">
                  <button
                    type="button"
                    className={editOccurrence ? "secondary" : "text-button"}
                    disabled={busy}
                    onClick={() => {
                      const root = items.find((i) => i.id === draft.id);
                      if (root) {
                        setDraft(occurrenceAt(root, selectedOccurrence.index));
                        setEditOccurrence(true);
                      }
                    }}
                  >
                    Alleen dit moment
                  </button>
                  <button
                    type="button"
                    className={!editOccurrence ? "secondary" : "text-button"}
                    disabled={busy}
                    onClick={() => {
                      const root = items.find((i) => i.id === draft.id);
                      if (root) {
                        setDraft(root);
                        setEditOccurrence(false);
                      }
                    }}
                  >
                    Hele reeks
                  </button>
                </div>
              )}
              <fieldset
                disabled={
                  busy || !canEditDraft || (cloud && draft.owner_id !== user)
                }
              >
                <label>
                  Soort
                  <select
                    disabled={!!draft.integration_id}
                    value={
                      draft.kind === "event" && draft.event_type !== "standard"
                        ? draft.event_type
                        : draft.kind
                    }
                    onChange={(e) => {
                      const type = e.target.value;
                      const special =
                        type === "birthday" || type === "vacation";
                      const day =
                        draft.start_date ||
                        localDate(draft.due_at).slice(0, 10) ||
                        new Date().toLocaleDateString("sv-SE");
                      setDraft({
                        ...draft,
                        kind: special ? "event" : (type as Item["kind"]),
                        busy: type === "birthday" ? false : draft.busy,
                        event_type: special
                          ? (type as Item["event_type"])
                          : "standard",
                        all_day: special,
                        start_date: special ? day : "",
                        end_date: special ? nextDay(day) : "",
                        repeat_kind:
                          type === "event" || special
                            ? "none"
                            : draft.repeat_kind,
                        schedule_kind: type === "birthday" ? "yearly" : "none",
                        schedule_exceptions: [],
                      });
                    }}
                  >
                    {Object.entries({
                      ...labels,
                      birthday: "Verjaardag",
                      vacation: "Vakantie",
                    }).map(([id, label]) => (
                      <option value={id} key={id}>
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
                {!draft.integration_id && (
                  <>
                    <ChecklistEditor
                      value={draft.checklist || []}
                      onChange={(checklist) =>
                        setDraft({ ...draft, checklist })
                      }
                    />
                    <div className="form-grid">
                      <label>
                        Lijstsoort
                        <select
                          value={draft.list_type}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              list_type: e.target.value as Item["list_type"],
                            })
                          }
                        >
                          <option value="none">Gewone taak of afspraak</option>
                          <option value="shopping">Boodschappenlijst</option>
                        </select>
                      </label>
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
                    </div>
                  </>
                )}
                {draft.kind === "event" &&
                  !draftNote &&
                  !draft.integration_id &&
                  !items.some((i) => i.id === draft.id) && (
                    <label>
                      Opslaan in agenda
                      <select
                        value={writeTarget}
                        onChange={(e) => setWriteTarget(e.target.value)}
                      >
                        <option value="todo">Todo-agenda</option>
                        {integrations
                          .filter((c) => c.enabled && c.provider !== "gmail")
                          .flatMap((c) =>
                            (c.write_calendar_ids || []).map((id) => (
                              <option
                                key={`${c.id}|${id}`}
                                value={`${c.id}|${id}`}
                              >
                                {providerLabels[c.provider]} ·{" "}
                                {c.calendar_names?.[id] || "Gekozen agenda"}
                              </option>
                            )),
                          )}
                      </select>
                    </label>
                  )}
                <EventFields item={draft} onChange={setDraft} />
                {draft.integration_id && (
                  <p className="hint">
                    Bronafspraak:{" "}
                    {canEditDraft
                      ? "wijzigingen gaan naar de oorspronkelijke agenda; dit scherm bewerkt één moment."
                      : "alleen lezen. Zet zo nodig schrijfrechten aan bij Instellingen. Verwijderen verbergt het item alleen in Todo."}
                  </p>
                )}
                {draft.kind === "event" &&
                  draft.schedule_exceptions.filter((e) => e.cancelled).length >
                    0 && (
                    <details>
                      <summary>Overgeslagen momenten herstellen</summary>
                      {draft.schedule_exceptions
                        .filter((e) => e.cancelled)
                        .map((e) => (
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy}
                            key={e.index}
                            onClick={() =>
                              void action(async () => {
                                await setException(
                                  items.find((i) => i.id === draft.id)!,
                                  e.index,
                                  null,
                                  draft.updated_at,
                                );
                                setDraft(null);
                                setNotice("Moment hersteld in de reeks.");
                              })
                            }
                          >
                            Herstel moment {e.index + 1}
                          </button>
                        ))}
                    </details>
                  )}
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
                    disabled={!!draft.integration_id}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        visibility: e.target.value as Item["visibility"],
                        household_id: household,
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
                {!draft.integration_id && draft.visibility === "selected" && (
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
                {!draft.integration_id && members.length > 0 && (
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
              {draft.title && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => void saveTemplate(draft)}
                >
                  Bewaar als sjabloon
                </button>
              )}
              <div className="modal-actions">
                {(!cloud || draft.owner_id === user) && (
                  <>
                    <button
                      className="primary"
                      disabled={busy || !canEditDraft}
                    >
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
