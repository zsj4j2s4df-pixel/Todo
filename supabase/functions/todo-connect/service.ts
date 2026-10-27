import { googleSync } from "./google-sync.ts";
import {
  Provider,
  ProviderError,
  providers,
  randomToken,
  digest,
  challenge,
  guardedFetch,
} from "./policy.ts";
import {
  APP_ORIGIN,
  Connection,
  Credentials,
  Env,
  configuration,
  oauthConfig,
  exchange,
  accountLabel,
  readyCredentials,
  calendars,
  calendarSnapshot,
  gmailSearch,
  gmailMessage,
} from "./providers.ts";
import { createSourceEvent, changeSourceEvent, eventInput } from "./write.ts";
export async function rpc(
  admin: any,
  name: string,
  args: Record<string, unknown> = {},
) {
  const r = await admin.rpc(name, args);
  if (r.error)
    throw new ProviderError(
      "configuration",
      "De verbinding kon niet worden bijgewerkt. Controleer de inrichting of probeer opnieuw.",
    );
  return r.data;
}
export async function withConnection<T>(
  admin: any,
  owner: string,
  id: string,
  env: Env,
  fn: (c: Connection, credentials: Credentials) => Promise<T>,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const claim = await rpc(admin, "integration_claim", {
    owner_id: owner,
    cid: id,
  });
  let cred = claim.credentials as Credentials,
    code: ProviderError["code"] | null = null;
  try {
    cred = await readyCredentials(claim.connection, cred, env, fetcher);
    return await fn(claim.connection, cred);
  } catch (e) {
    code = e instanceof ProviderError ? e.code : "network";
    throw e instanceof ProviderError
      ? e
      : new ProviderError(
          "network",
          "Verwerken van de providergegevens is niet gelukt. Probeer opnieuw.",
        );
  } finally {
    await admin.rpc("integration_finish", {
      owner_id: owner,
      cid: id,
      claim_lease: claim.lease,
      credentials: cred,
      result_status: code
        ? code === "authorization"
          ? "reauth"
          : "error"
        : "connected",
      result_error: code,
    });
  }
}
/** Dedicated sync path keeps the same lease for fetch and commit. */
export async function performSync(
  admin: any,
  owner: string,
  id: string,
  env: Env,
  fetcher: typeof fetch = fetch,
) {
  const claim = await rpc(admin, "integration_claim", {
    owner_id: owner,
    cid: id,
  });
  let cred = claim.credentials as Credentials,
    code: ProviderError["code"] | null = null;
  try {
    const c: Connection = claim.connection;
    cred = await readyCredentials(c, cred, env, fetcher);
    if (c.provider === "gmail" || !c.calendar_ids.length) return { count: 0 };
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - 7);
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    to.setUTCDate(to.getUTCDate() + 30);
    let events,
      sync_state = null;
    if (c.provider === "google_calendar") {
      const cache = await rpc(admin, "integration_cache", {
        owner_id: owner,
        cid: id,
        window_start: from.toISOString(),
        window_end: to.toISOString(),
      });
      const delta = await googleSync(
        c,
        cred,
        from.toISOString(),
        to.toISOString(),
        cache || [],
        fetcher,
      );
      events = delta.events;
      sync_state = delta.states;
    } else
      events = await calendarSnapshot(
        c,
        cred,
        from.toISOString(),
        to.toISOString(),
        fetcher,
      );
    const count = await rpc(admin, "integration_sync", {
      owner_id: owner,
      cid: id,
      claim_lease: claim.lease,
      events,
      sync_state,
      window_start: from.toISOString(),
      window_end: to.toISOString(),
    });
    return { count };
  } catch (e) {
    code = e instanceof ProviderError ? e.code : "network";
    throw e instanceof ProviderError
      ? e
      : new ProviderError(
          "network",
          "Agenda kon niet volledig worden verwerkt; eerdere gegevens blijven behouden.",
        );
  } finally {
    await admin.rpc("integration_finish", {
      owner_id: owner,
      cid: id,
      claim_lease: claim.lease,
      credentials: cred,
      result_status: code
        ? code === "authorization"
          ? "reauth"
          : "error"
        : "connected",
      result_error: code,
    });
  }
}
function canWrite(provider: Provider, cred: Credentials) {
  return (
    provider === "icloud_calendar" ||
    String(cred.scope || "")
      .split(" ")
      .some((s) =>
        provider === "outlook_calendar"
          ? /Calendars\.ReadWrite$/i.test(s)
          : s === "https://www.googleapis.com/auth/calendar.events",
      )
  );
}
export async function performWrite(
  admin: any,
  userClient: any,
  owner: string,
  body: any,
  env: Env,
  fetcher: typeof fetch = fetch,
) {
  if (body.note_id)
    throw new ProviderError(
      "unsupported",
      "Verwerk deze notitie eerst als privéafspraak in Todo.",
    );
  if (body.confirmed_external_effects !== true)
    throw new ProviderError(
      "unsupported",
      "Bevestig eerst dat de bronagenda wordt gewijzigd en deelnemers mogelijk een bericht krijgen.",
    );
  let existing: any = null;
  if (body.action !== "create") {
    const row = await userClient
      .from("items")
      .select("*")
      .eq("id", body.item_id)
      .eq("owner_id", owner)
      .single();
    if (
      row.error ||
      !row.data ||
      row.data.integration_id !== body.id ||
      row.data.updated_at !== body.expected_updated_at
    )
      throw new ProviderError(
        "conflict",
        "Afspraak of rechten zijn gewijzigd. Vernieuw eerst.",
      );
    existing = row.data;
  }
  const claim = await rpc(admin, "integration_claim", {
    owner_id: owner,
    cid: body.id,
  });
  let cred = claim.credentials as Credentials,
    code: ProviderError["code"] | null = null,
    upstreamSaved = false;
  try {
    const c = claim.connection as Connection & { write_calendar_ids: string[] };
    cred = await readyCredentials(c, cred, env, fetcher);
    const calendar = existing?.source_calendar_id || body.calendar_id;
    if (
      !c.write_enabled ||
      !c.write_calendar_ids.includes(calendar) ||
      !canWrite(c.provider, cred)
    )
      throw new ProviderError(
        "authorization",
        "Zet eerst schrijfrechten voor deze agenda aan.",
      );
    const input = body.action === "delete" ? null : eventInput(body.item);
    if (existing && input && input.schedule_kind !== "none")
      throw new ProviderError(
        "unsupported",
        "Wijzig de hele externe reeks in de bronagenda. Dit scherm bewerkt één moment.",
      );
    let source;
    if (body.action === "create")
      source = await createSourceEvent(
        c,
        cred,
        calendar,
        input,
        body.request_id,
        fetcher,
      );
    else {
      const resource = await rpc(admin, "integration_resource", {
        owner_id: owner,
        cid: c.id,
        item_id: existing.id,
      });
      if (!resource)
        throw new ProviderError(
          "conflict",
          "Brongegevens ontbreken. Synchroniseer opnieuw.",
        );
      source = await changeSourceEvent(
        c,
        cred,
        calendar,
        resource,
        existing.source_version,
        input,
        body.action === "delete",
        fetcher,
      );
    }
    upstreamSaved = true;
    if (body.action === "delete")
      await rpc(admin, "integration_deleted_event", {
        owner_id: owner,
        cid: c.id,
        claim_lease: claim.lease,
        item_id: existing.id,
      });
    else if (source && input?.schedule_kind === "none")
      await rpc(admin, "integration_sync", {
        owner_id: owner,
        cid: c.id,
        claim_lease: claim.lease,
        events: [source],
        window_start: source.item.due_at,
        window_end: new Date(
          Date.parse(source.item.due_at) + 1000,
        ).toISOString(),
        replace_snapshot: false,
      });
    const anchor = new Date(input?.due_at || existing.due_at),
      from = new Date(+anchor - 86400000),
      to = new Date(+anchor + 2 * 86400000);
    const events = await calendarSnapshot(
      c,
      cred,
      from.toISOString(),
      to.toISOString(),
      fetcher,
    );
    await rpc(admin, "integration_sync", {
      owner_id: owner,
      cid: c.id,
      claim_lease: claim.lease,
      events,
      window_start: from.toISOString(),
      window_end: to.toISOString(),
    });
    return { saved: true, refresh_pending: false };
  } catch (e) {
    code = e instanceof ProviderError ? e.code : "network";
    if (upstreamSaved)
      return {
        saved: true,
        refresh_pending: true,
        message:
          "De wijziging is in de bronagenda opgeslagen. Het Todo-overzicht kon nog niet worden vernieuwd; synchroniseer opnieuw.",
      };
    throw e instanceof ProviderError
      ? e
      : new ProviderError(
          "network",
          "Opslaan in de bronagenda is niet bevestigd. Synchroniseer voordat je opnieuw probeert.",
        );
  } finally {
    await admin.rpc("integration_finish", {
      owner_id: owner,
      cid: body.id,
      claim_lease: claim.lease,
      credentials: cred,
      result_status: code
        ? code === "authorization"
          ? "reauth"
          : "error"
        : "connected",
      result_error: code,
    });
  }
}
export async function connectorAction(
  admin: any,
  userClient: any,
  owner: string,
  body: any,
  env: Env,
  fetcher: typeof fetch = fetch,
) {
  if (body.action === "status")
    return {
      configured: configuration(env),
      sync_past_days: 7,
      sync_future_days: 30,
    };
  if (body.action === "start") {
    if (
      !providers.includes(body.provider) ||
      body.provider === "icloud_calendar"
    )
      throw new ProviderError("unsupported", "Onbekende provider.");
    const provider = body.provider as Provider,
      config = oauthConfig(provider, env),
      verifier = randomToken(),
      state = `${provider}.${randomToken()}`;
    if (body.connection_id) {
      const r = await admin
        .from("integrations")
        .select("id")
        .eq("id", body.connection_id)
        .eq("user_id", owner)
        .eq("provider", provider)
        .eq("enabled", true)
        .single();
      if (r.error)
        throw new ProviderError(
          "authorization",
          "Verbinding niet beschikbaar.",
        );
    }
    const write = body.write === true && provider !== "gmail";
    const scope = write
      ? config.scope
      : config.scope
          .replace(
            "https://www.googleapis.com/auth/calendar.events ",
            "https://www.googleapis.com/auth/calendar.events.readonly ",
          )
          .replace("Calendars.ReadWrite", "Calendars.Read");
    await rpc(admin, "integration_oauth_state", {
      owner_id: owner,
      provider_name: provider,
      state_digest: await digest(state),
      details: {
        verifier,
        redirect_uri: config.redirect_uri,
        connection_id: body.connection_id || null,
        write,
      },
    });
    const url = new URL(config.authorize);
    url.search = new URLSearchParams({
      client_id: config.client,
      redirect_uri: config.redirect_uri,
      response_type: "code",
      scope,
      state,
      code_challenge: await challenge(verifier),
      code_challenge_method: "S256",
      ...(provider === "outlook_calendar"
        ? { prompt: "select_account" }
        : {
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
          }),
    }).toString();
    return { url: url.href };
  }
  if (body.action === "callback") {
    if (
      typeof body.state !== "string" ||
      body.state.length > 500 ||
      typeof body.code !== "string" ||
      body.code.length > 5000
    )
      throw new ProviderError("authorization", "Ongeldige aanmeldreactie.");
    const provider = body.state.split(".")[0] as Provider;
    if (!providers.includes(provider) || provider === "icloud_calendar")
      throw new ProviderError("authorization", "Onbekende aanmelding.");
    const details = await rpc(admin, "integration_take_oauth", {
      owner_id: owner,
      provider_name: provider,
      state_digest: await digest(body.state),
    });
    const cred = await exchange(
      provider,
      env,
      {
        grant_type: "authorization_code",
        code: body.code,
        code_verifier: details.verifier,
        redirect_uri: details.redirect_uri,
      },
      fetcher,
    );
    const label = await accountLabel(provider, cred, fetcher);
    if (details.connection_id) {
      await rpc(admin, "integration_reconnect", {
        owner_id: owner,
        cid: details.connection_id,
        label,
        credentials: cred,
        allow_write: details.write,
      });
      return { id: details.connection_id };
    }
    return {
      id: await rpc(admin, "integration_connect", {
        owner_id: owner,
        provider_name: provider,
        label,
        credentials: cred,
      }),
    };
  }
  if (body.action === "icloud") {
    if (!(await rpc(admin, "integration_gate", { owner_id: owner })))
      throw new ProviderError(
        "limit",
        "Te veel verbindingsverzoeken. Probeer later opnieuw.",
      );
    const username = String(body.username || "").trim(),
      password = String(body.password || "");
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) ||
      username.length > 200 ||
      password.length < 10 ||
      password.length > 200
    )
      throw new ProviderError(
        "authorization",
        "Vul je Apple-account en app-specifieke wachtwoord in.",
      );
    const cred = { username, password };
    const fake: Connection = {
      id: "",
      user_id: owner,
      provider: "icloud_calendar",
      calendar_ids: [],
      write_enabled: false,
      account_label: username,
      enabled: true,
    };
    await calendars(fake, cred, fetcher);
    return {
      id: await rpc(admin, "integration_connect", {
        owner_id: owner,
        provider_name: "icloud_calendar",
        label: username,
        credentials: cred,
      }),
    };
  }
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id))
    throw new ProviderError("authorization", "Kies een eigen verbinding.");
  const id = body.id;
  if (["create", "update", "delete"].includes(body.action))
    return performWrite(admin, userClient, owner, body, env, fetcher);
  if (body.action === "sync")
    return performSync(admin, owner, id, env, fetcher);
  if (body.action === "calendars")
    return withConnection(
      admin,
      owner,
      id,
      env,
      async (c, cred) => ({
        calendars: await calendars(c, cred, fetcher),
        write_authorized: canWrite(c.provider, cred),
      }),
      fetcher,
    );
  if (body.action === "select") {
    if (
      !Array.isArray(body.calendar_ids) ||
      body.calendar_ids.length > 20 ||
      !Array.isArray(body.write_calendar_ids) ||
      body.write_calendar_ids.length > 20
    )
      throw new ProviderError("unsupported", "Kies maximaal 20 agenda’s.");
    const available = await withConnection(
      admin,
      owner,
      id,
      env,
      async (c, cred) => ({
        list: await calendars(c, cred, fetcher),
        write: canWrite(c.provider, cred),
      }),
      fetcher,
    );
    const selected = [...new Set<string>(body.calendar_ids)],
      writes = [...new Set<string>(body.write_calendar_ids)];
    if (
      selected.some((x) => !available.list.some((c) => c.id === x)) ||
      writes.some(
        (x) =>
          !selected.includes(x) ||
          !available.write ||
          !available.list.some((c) => c.id === x && c.writable),
      )
    )
      throw new ProviderError(
        "authorization",
        "Geen schrijfrechten voor deze agenda. Verbind zo nodig opnieuw met schrijfrechten.",
      );
    await rpc(admin, "integration_select", {
      owner_id: owner,
      cid: id,
      calendars: selected,
      allow_write: writes.length > 0,
      write_ids: writes,
      names: Object.fromEntries(
        available.list
          .filter((c) => selected.includes(c.id))
          .map((c) => [c.id, c.name]),
      ),
    });
    return { selected: true };
  }
  if (body.action === "gmail_search")
    return withConnection(
      admin,
      owner,
      id,
      env,
      async (c, cred) => {
        if (c.provider !== "gmail")
          throw new ProviderError("unsupported", "Kies een Gmail-verbinding.");
        return {
          messages: await gmailSearch(cred, String(body.query || ""), fetcher),
        };
      },
      fetcher,
    );
  if (body.action === "gmail_import")
    return withConnection(
      admin,
      owner,
      id,
      env,
      async (c, cred) => {
        if (c.provider !== "gmail")
          throw new ProviderError("unsupported", "Kies Gmail.");
        const note = await gmailMessage(
          cred,
          String(body.message_id || ""),
          fetcher,
        );
        const result = await admin
          .from("inbox_notes")
          .upsert(
            {
              id: crypto.randomUUID(),
              user_id: owner,
              ...note,
              source_key: `${await digest(c.account_label.toLowerCase())}:${note.source_key}`,
              source_url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(c.account_label)}#all/${encodeURIComponent(String(body.message_id))}`,
              integration_id: id,
              source_type: "gmail",
              state: "inbox",
            },
            {
              onConflict: "user_id,source_type,source_key",
              ignoreDuplicates: true,
            },
          )
          .select("id");
        if (result.error)
          throw new ProviderError(
            "configuration",
            "Deze mail kon niet worden bewaard.",
          );
        return { imported: result.data?.length || 0 };
      },
      fetcher,
    );
  if (body.action === "disconnect") {
    if (typeof body.remove_mirrors !== "boolean")
      throw new ProviderError(
        "unsupported",
        "Kies wat er met ingelezen afspraken gebeurt.",
      );
    let revoked = false;
    if (body.revoke_provider === true) {
      try {
        await withConnection(
          admin,
          owner,
          id,
          env,
          async (c, cred) => {
            if (!["google_calendar", "gmail"].includes(c.provider))
              throw new ProviderError(
                "unsupported",
                "Trek deze toestemming bij de provider in.",
              );
            const response = await guardedFetch(c.provider, fetcher)(
              "https://oauth2.googleapis.com/revoke",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  token: String(cred.refresh_token || cred.access_token || ""),
                }),
              },
            );
            if (!response.ok)
              throw new ProviderError(
                "network",
                "Toestemming kon niet worden ingetrokken.",
              );
            revoked = true;
          },
          fetcher,
        );
      } catch {
        /* Always remove local credentials, including when Google is unavailable. */
      }
    }
    // Removing the local credential immediately prevents Todo from using it again.
    await rpc(admin, "integration_disconnect", {
      owner_id: owner,
      cid: id,
      remove_mirrors: body.remove_mirrors,
    });
    return {
      disconnected: true,
      provider_permissions: revoked
        ? "Todo heeft de Google-toestemming ingetrokken. Andere Google-koppelingen van hetzelfde account moeten mogelijk opnieuw worden verbonden."
        : "Todo is ontkoppeld. Trek de toestemming ook in bij Google/Microsoft of verwijder het app-specifieke wachtwoord bij Apple.",
    };
  }
  throw new ProviderError("unsupported", "Onbekende verbindingsactie.");
}
export async function scheduledSync(admin: any, env: Env) {
  const due = await rpc(admin, "integration_due");
  let synced = 0,
    failed = 0;
  for (const c of due || [])
    try {
      const timeout = AbortSignal.timeout(15000);
      await performSync(admin, c.user_id, c.id, env, (input, init = {}) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            timeout,
            ...(init.signal ? [init.signal] : []),
          ]),
        }),
      );
      synced++;
    } catch {
      failed++;
    }
  return { synced, failed };
}
