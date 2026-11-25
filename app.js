const CONFIG = window.APP_CONFIG || {};
const FAMILY_ID = "0783120a-b902-4e55-878f-14dc8f108b38";
const hasConfig = Boolean(CONFIG.url && CONFIG.anonKey && window.supabase);
const client = hasConfig ? window.supabase.createClient(CONFIG.url, CONFIG.anonKey) : null;
let participantToken = sessionStorage.getItem("participant_token") || null;
let currentParticipant = null;
let activeEvent = null;
let participantCache = [];
let participantPolling = null;
let participantReloading = false;
let participantHasSecret = false;

const $ = (id) => document.getElementById(id);
function showModal(id) { $(id).classList.add("active"); $(id).setAttribute("aria-hidden", "false"); }
function hideModal(el) { const modal = el.closest(".modal-backdrop"); if (modal) { modal.classList.remove("active"); modal.setAttribute("aria-hidden", "true"); } }
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => hideModal(button)));
document.querySelectorAll(".modal-backdrop").forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) hideModal(modal); }));
$("participantOpen").onclick = () => showModal("participantModal");
$("heroInvite").onclick = () => showModal("participantModal");
$("adminOpen").onclick = () => showModal("adminModal");
$("participantForm").addEventListener("submit", participantLogin);
$("requestCodeForm").addEventListener("submit", requestParticipantCode);
$("adminForm").addEventListener("submit", adminLogin);
$("forgotPassword").addEventListener("click", requestPasswordReset);
$("passwordResetForm").addEventListener("submit", saveNewPassword);
$("eventForm").addEventListener("submit", saveEvent);
$("addParticipantForm").addEventListener("submit", addParticipant);
$("drawButton").addEventListener("click", drawSecret);
$("logout").addEventListener("click", logout);
$("addWishForm").addEventListener("submit", saveWish);
$("profileForm").addEventListener("submit", saveParticipantProfile);
$("editProfile").addEventListener("click", () => showModal("profileModal"));
$("emailSettingsForm").addEventListener("submit", saveNotificationEmail);
$("restrictionForm").addEventListener("submit", addRestriction);
$("copyCode").addEventListener("click", async () => { await navigator.clipboard.writeText($("generatedCode").textContent); $("copyCode").textContent = "Copiado!"; });

function requireConfig(target) {
  if (!client) { $(target).textContent = "Configure a URL, chave pública e ID da família em config.js."; return false; }
  return true;
}
function callOptions(token = participantToken) { return { body: { token, family_id: FAMILY_ID } }; }

if (client) {
  client.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") showModal("passwordResetModal");
  });
}

async function requestPasswordReset() {
  if (!requireConfig("adminNotice")) return;
  const email = $("adminEmail").value.trim();
  if (!email) { $("adminNotice").textContent = "Digite seu e-mail acima para receber o link."; $("adminEmail").focus(); return; }
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  $("adminNotice").textContent = error ? `Não foi possível enviar o link: ${error.message}` : "Enviamos um link para seu e-mail. Abra-o neste mesmo endereço para criar a nova senha.";
}

async function saveNewPassword(event) {
  event.preventDefault();
  const password = $("newPassword").value;
  if (password.length < 8) { $("passwordResetNotice").textContent = "Use pelo menos 8 caracteres."; return; }
  if (password !== $("confirmPassword").value) { $("passwordResetNotice").textContent = "As senhas não coincidem."; return; }
  const { error } = await client.auth.updateUser({ password });
  if (error) { $("passwordResetNotice").textContent = `Não foi possível atualizar a senha: ${error.message}`; return; }
  $("passwordResetForm").reset();
  $("passwordResetNotice").textContent = "Senha atualizada. Agora você pode entrar no painel com a nova senha.";
  setTimeout(() => hideModal($("passwordResetForm")), 1800);
}

async function participantLogin(event) {
  event.preventDefault();
  if (!requireConfig("participantNotice")) return;
  $("participantNotice").textContent = "Validando convite...";
  try {
    const { data, error } = await client.functions.invoke("participant-access", { body: { code: $("inviteCode").value.trim().toUpperCase(), family_id: FAMILY_ID } });
    if (error) throw error;
    if (!data?.token) throw new Error(data?.error || "Código inválido.");
    participantToken = data.token;
    sessionStorage.setItem("participant_token", participantToken);
    hideModal($("participantForm"));
    await loadParticipantArea();
  } catch (error) { $("participantNotice").textContent = error.message || "Não foi possível validar o código."; }
}

async function requestParticipantCode(event) {
  event.preventDefault();
  if (!requireConfig("requestCodeNotice")) return;
  const name = $("requestParticipantName").value.trim();
  $("requestCodeNotice").textContent = "Enviando pedido ao organizador...";
  const { data, error } = await client.functions.invoke("request-participant-code", { body: { nome: name, family_id: FAMILY_ID } });
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error?.context && typeof error.context.json === "function") {
      const response = error.context.clone ? error.context.clone() : error.context;
      message = (await response.json().catch(() => null))?.error;
    }
    $("requestCodeNotice").textContent = message || "Não foi possível enviar o pedido. Tente novamente mais tarde.";
    return;
  }
  $("requestCodeForm").reset();
  $("requestCodeNotice").textContent = data?.message || "Pedido enviado. Peça ao organizador que compartilhe seu código de acesso.";
}

async function loadParticipantArea({ silent = false } = {}) {
  if (!participantToken || participantReloading) return;
  participantReloading = true;
  let result;
  try { result = await client.functions.invoke("participant-me", callOptions()); }
  catch (loadError) {
    participantReloading = false;
    if (!silent) alert("Não foi possível carregar sua área. Confira sua conexão e tente novamente.");
    return;
  }
  participantReloading = false;
  const { data, error } = result;
  if (error || !data) {
    if (silent) return;
    sessionStorage.removeItem("participant_token"); participantToken = null; currentParticipant = null;
    alert("Sua sessão expirou. Entre novamente."); return;
  }
  currentParticipant = data.participant;
  const profile = data.profile || {};
  $("clothingSize").value = profile.tamanho_roupa || "";
  $("shoeSize").value = profile.numero_calcado || "";
  $("wantedGifts").value = profile.presentes_queridos || "";
  $("unwantedGifts").value = profile.presentes_nao_queridos || "";
  $("profileNotice").textContent = "";
  const profileComplete = Boolean(profile.tamanho_roupa && profile.numero_calcado && profile.presentes_queridos);
  const secret = data.secret;
  $("secretCard").hidden = !secret;
  $("drawWaiting").hidden = Boolean(secret);
  $("secretWishesSection").hidden = !secret;
  $("resultSubtitle").textContent = secret
    ? "Guarde o segredo! Veja as informações de quem você tirou."
    : "Seu perfil foi salvo. O resultado aparecerá aqui quando o organizador realizar o sorteio.";
  $("drawWaiting").textContent = "Ainda não há resultado. Assim que o organizador fizer o sorteio, o nome aparecerá aqui.";
  if (secret) {
    $("secretName").textContent = secret.nome;
    $("secretAvatar").textContent = (secret.nome || "?").trim().charAt(0).toLocaleUpperCase("pt-BR");
    $("secretEvent").textContent = data.event_name || "Amigo Secreto da Família Senhorinha";
    const min = data.event_minimum == null ? null : Number(data.event_minimum);
    const max = data.event_maximum == null ? null : Number(data.event_maximum);
    $("secretBudget").textContent = max == null ? "A combinar" : `R$ ${max.toFixed(0)}`;
    $("secretClothing").textContent = secret.tamanho_roupa || "Não informou";
    $("secretShoes").textContent = secret.numero_calcado || "Não informou";
    const tags = (secret.presentes_queridos || "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
    $("secretGifts").replaceChildren();
    tags.forEach((gift) => { const tag = document.createElement("span"); tag.textContent = gift; $("secretGifts").append(tag); });
    $("secretAvoid").hidden = !secret.presentes_nao_queridos;
    $("secretAvoid").textContent = secret.presentes_nao_queridos ? `Não quer ganhar: ${secret.presentes_nao_queridos}` : "";
  }
  renderWishes($("wishList"), data.wishes || [], false);
  renderWishes($("myWishList"), data.my_wishes || [], data.event_status === "rascunho");
  $("wishLimit").textContent = `${(data.my_wishes || []).length} de ${data.max_wishes} sugestões`;
  $("addWishForm").hidden = data.event_status !== "rascunho";
  $("wishLimit").textContent += data.event_status === "rascunho" ? " · você pode editar até o sorteio" : " · lista bloqueada após o sorteio";
  if (!profileComplete) {
    hideModal($("resultModal"));
    showModal("profileModal");
    if (participantPolling) { clearInterval(participantPolling); participantPolling = null; }
    return;
  }
  if (silent) {
    if (secret && !participantHasSecret) showModal("resultModal");
    participantHasSecret = Boolean(secret);
    return;
  }
  hideModal($("profileModal"));
  showModal("resultModal");
  participantHasSecret = Boolean(secret);
  if (!participantPolling) participantPolling = setInterval(() => {
    if (document.visibilityState === "visible") loadParticipantArea({ silent: true });
  }, 20000);
}

async function saveParticipantProfile(event) {
  event.preventDefault();
  if (!participantToken) return;
  const profile = {
    tamanho_roupa: $("clothingSize").value.trim(),
    numero_calcado: $("shoeSize").value.trim(),
    presentes_queridos: $("wantedGifts").value.trim(),
    presentes_nao_queridos: $("unwantedGifts").value.trim()
  };
  if (!profile.tamanho_roupa || !profile.numero_calcado || !profile.presentes_queridos) {
    $("profileNotice").textContent = "Preencha roupa, calçado e os presentes que gostaria de ganhar. A lista do que não quer ganhar é opcional.";
    return;
  }
  $("profileNotice").textContent = "Salvando seu perfil...";
  const { data, error } = await client.functions.invoke("participant-profile", { body: { ...callOptions().body, profile } });
  if (error || data?.error) { $("profileNotice").textContent = data?.error || "Não foi possível salvar seu perfil."; return; }
  await loadParticipantArea();
}

function renderWishes(container, wishes, editable) {
  container.replaceChildren();
  if (!wishes.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = editable ? "Sua lista ainda está vazia." : "Nenhuma sugestão cadastrada."; container.append(empty); return; }
  wishes.forEach((wish) => {
    const item = document.createElement("div"); item.className = "wish-item";
    const title = document.createElement("strong"); title.textContent = wish.titulo; item.append(title);
    if (wish.descricao) { const description = document.createElement("p"); description.textContent = wish.descricao; item.append(description); }
    if (wish.link) { const link = document.createElement("a"); link.href = wish.link; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Ver sugestão"; item.append(link); }
    if (wish.preco_estimado != null) { const price = document.createElement("p"); price.textContent = `Preço aproximado: R$ ${Number(wish.preco_estimado).toFixed(2)}`; item.append(price); }
    if (editable) {
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn btn-outline wish-delete"; edit.textContent = "Editar";
      edit.addEventListener("click", () => { $("wishEditId").value = wish.id; $("wishTitle").value = wish.titulo; $("wishDescription").value = wish.descricao || ""; $("wishLink").value = wish.link || ""; $("wishPrice").value = wish.preco_estimado ?? ""; $("addWishForm").querySelector('[type="submit"]').textContent = "Salvar alteração"; $("wishTitle").focus(); });
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn btn-outline wish-delete"; remove.textContent = "Remover"; remove.addEventListener("click", () => deleteWish(wish.id)); item.append(edit, remove);
    }
    container.append(item);
  });
}

async function saveWish(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const item = { titulo: $("wishTitle").value.trim(), descricao: $("wishDescription").value.trim() || null, link: $("wishLink").value.trim() || null, preco_estimado: $("wishPrice").value ? Number($("wishPrice").value) : null };
  const wishId = $("wishEditId").value;
  const { data, error } = await client.functions.invoke("participant-wishes", { body: { ...callOptions().body, action: wishId ? "update" : "add", id: wishId || undefined, item } });
  if (error || data?.error) { $("wishNotice").textContent = data?.error || error.message; return; }
  form.reset(); $("wishEditId").value = ""; form.querySelector('[type="submit"]').textContent = "Adicionar sugestão"; $("wishNotice").textContent = wishId ? "Sugestão atualizada." : "Sugestão adicionada."; await loadParticipantArea();
}

async function deleteWish(id) {
  const { data, error } = await client.functions.invoke("participant-wishes", { ...callOptions(), body: { ...callOptions().body, action: "delete", id } });
  if (error || data?.error) { $("wishNotice").textContent = data?.error || error.message; return; }
  $("wishNotice").textContent = "Sugestão removida."; await loadParticipantArea();
}

async function adminLogin(event) {
  event.preventDefault(); if (!requireConfig("adminNotice")) return;
  $("adminNotice").textContent = "Verificando acesso...";
  const { data, error } = await client.auth.signInWithPassword({ email: $("adminEmail").value, password: $("adminPassword").value });
  if (error) { $("adminNotice").textContent = "E-mail ou senha inválidos."; return; }
  const { data: adminCheck, error: checkError } = await client.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (checkError || !adminCheck) { await client.auth.signOut(); $("adminNotice").textContent = "Esta conta não está autorizada como administradora."; return; }
  hideModal($("adminForm")); $("dashboard").hidden = false; $("dashboard").scrollIntoView({ behavior: "smooth" }); await refreshDashboard();
}

async function logout() { if (client) await client.auth.signOut(); $("dashboard").hidden = true; window.scrollTo({ top: 0, behavior: "smooth" }); }

async function refreshDashboard() {
  if (!client) return;
  const familyId = FAMILY_ID;
  const { data: family } = await client.from("familias").select("email_notificacao").eq("id", familyId).maybeSingle();
  $("notificationEmail").value = family?.email_notificacao || "";
  const { data: event, error: eventError } = await client.from("sorteios").select("*").eq("familia_id", familyId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (eventError) { $("dashboardNotice").textContent = "Não foi possível carregar o evento. Verifique a autorização administrativa."; return; }
  if (event) {
    activeEvent = event;
    $("eventName").value = event.nome; $("eventDate").value = event.data_evento || "";
    $("minValue").value = event.valor_minimo ?? 0; $("maxValue").value = event.valor_maximo ?? 100;
    $("statEvent").textContent = event.nome; $("eventRules").value = event.regras || "";
    $("drawButton").disabled = event.status !== "rascunho";
  }
  const { data: people, error } = await client.from("participantes").select("id,nome,ultimo_acesso,created_at").eq("familia_id", familyId).order("nome");
  if (error) { $("dashboardNotice").textContent = "Não foi possível carregar participantes."; return; }
  $("statParticipants").textContent = people.length; $("statAccessed").textContent = people.filter((person) => person.ultimo_acesso).length;
  participantCache = people;
  await refreshRestrictions();
  $("participantsTable").replaceChildren();
  if (!people.length) { $("participantsTable").innerHTML = '<p class="muted">Nenhum familiar cadastrado ainda.</p>'; return; }
  const table = document.createElement("table"); table.innerHTML = "<thead><tr><th>Nome</th><th>Acesso</th><th>Ação</th></tr></thead>";
  const body = document.createElement("tbody");
  people.forEach((person) => { const row = document.createElement("tr"); const name = document.createElement("td"); name.textContent = person.nome; const access = document.createElement("td"); access.textContent = person.ultimo_acesso ? "Já acessou" : "Não acessou"; const action = document.createElement("td"); const remove = document.createElement("button"); remove.className = "btn btn-outline"; remove.textContent = "Excluir"; remove.onclick = () => removeParticipant(person.id, person.nome); action.append(remove); row.append(name, access, action); body.append(row); });
  table.append(body); $("participantsTable").append(table);
}

async function refreshRestrictions() {
  const selectors = [$("restrictionPerson"), $("restrictedPerson")];
  selectors.forEach((select) => {
    select.replaceChildren();
    participantCache.forEach((person) => { const option = document.createElement("option"); option.value = person.id; option.textContent = person.nome; select.append(option); });
    select.disabled = !activeEvent || activeEvent.status !== "rascunho" || participantCache.length < 2;
  });
  const form = $("restrictionForm");
  form.querySelector('[type="submit"]').disabled = !activeEvent || activeEvent.status !== "rascunho" || participantCache.length < 2;
  const container = $("restrictionList"); container.replaceChildren();
  if (!activeEvent) return;
  const { data: rules, error } = await client.from("restricoes_sorteio").select("id,participante_id,participante_restrito_id").eq("sorteio_id", activeEvent.id).eq("familia_id", FAMILY_ID);
  if (error || !rules?.length) { const message = document.createElement("p"); message.className = "muted"; message.textContent = error ? "Não foi possível carregar as restrições." : "Nenhuma restrição cadastrada."; container.append(message); return; }
  rules.forEach((rule) => {
    const row = document.createElement("div"); row.className = "wish-item";
    const text = document.createElement("span");
    const giver = participantCache.find((person) => person.id === rule.participante_id)?.nome || "Familiar";
    const receiver = participantCache.find((person) => person.id === rule.participante_restrito_id)?.nome || "Familiar";
    text.textContent = `${giver} não pode tirar ${receiver}`; row.append(text);
    if (activeEvent.status === "rascunho") { const remove = document.createElement("button"); remove.className = "btn btn-outline wish-delete"; remove.textContent = "Remover"; remove.onclick = async () => { const { error: removeError } = await client.from("restricoes_sorteio").delete().eq("id", rule.id).eq("familia_id", FAMILY_ID); $("dashboardNotice").textContent = removeError ? "Não foi possível remover a restrição." : "Restrição removida."; await refreshRestrictions(); }; row.append(remove); }
    container.append(row);
  });
}

async function addRestriction(event) {
  event.preventDefault();
  const participantId = $("restrictionPerson").value; const restrictedId = $("restrictedPerson").value;
  if (!activeEvent || !participantId || !restrictedId || participantId === restrictedId) { $("dashboardNotice").textContent = "Escolha duas pessoas diferentes."; return; }
  const { error } = await client.from("restricoes_sorteio").insert({ sorteio_id: activeEvent.id, familia_id: FAMILY_ID, participante_id: participantId, participante_restrito_id: restrictedId });
  $("dashboardNotice").textContent = error ? "Essa restrição já existe ou não pôde ser salva." : "Restrição adicionada.";
  await refreshRestrictions();
}

async function saveEvent(event) {
  event.preventDefault();
  const maximum = Number($("maxValue").value); const minimum = Number($("minValue").value);
  if (maximum < minimum) { $("dashboardNotice").textContent = "O valor máximo não pode ser menor que o mínimo."; return; }
  const { data: existing, error: lookupError } = await client.from("sorteios").select("id,status").eq("familia_id", FAMILY_ID).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lookupError || !existing) { $("dashboardNotice").textContent = "Evento não encontrado para esta família."; return; }
  if (existing.status !== "rascunho") { $("dashboardNotice").textContent = "As configurações não podem ser alteradas após o sorteio."; return; }
  const payload = { nome: $("eventName").value.trim(), data_evento: $("eventDate").value || null, valor_minimo: minimum, valor_maximo: maximum, regras: $("eventRules").value.trim() || null };
  const { error } = await client.from("sorteios").update(payload).eq("id", existing.id).eq("familia_id", FAMILY_ID);
  $("dashboardNotice").textContent = error ? "Não foi possível salvar as configurações." : "Configurações salvas."; await refreshDashboard();
}

async function saveNotificationEmail(event) {
  event.preventDefault();
  const email = $("notificationEmail").value.trim().toLowerCase();
  const { error } = await client.from("familias").update({ email_notificacao: email }).eq("id", FAMILY_ID);
  $("emailSettingsNotice").textContent = error ? "Não foi possível salvar o e-mail. Confirme que você entrou como organizador." : "E-mail salvo. Os pedidos de código serão enviados para este endereço.";
}

async function addParticipant(event) {
  event.preventDefault(); const name = $("newParticipantName").value.trim(); if (!name) return;
  const { data, error } = await client.functions.invoke("admin-create-participant", { body: { nome: name, family_id: FAMILY_ID } });
  if (error || !data?.code) {
    let message = data?.error;
    if (!message && error?.context && typeof error.context.json === "function") {
      const response = error.context.clone ? error.context.clone() : error.context;
      message = (await response.json().catch(() => null))?.error;
    }
    $("dashboardNotice").textContent = message || "Não foi possível cadastrar. Atualize a página e entre novamente no painel.";
    return;
  }
  $("generatedCode").textContent = data.code; showModal("newCodeModal"); $("newParticipantName").value = ""; await refreshDashboard();
}

async function removeParticipant(id, name) {
  if (!confirm(`Excluir ${name}? Esta ação também remove seus dados associados.`)) return;
  const { error } = await client.from("participantes").delete().eq("id", id).eq("familia_id", FAMILY_ID);
  $("dashboardNotice").textContent = error ? "Não foi possível remover o participante." : "Participante removido."; await refreshDashboard();
}

async function drawSecret() {
  if (!confirm("Realizar o sorteio agora? Esta ação define os pares do evento.")) return;
  $("dashboardNotice").textContent = "Realizando sorteio...";
  const { data, error } = await client.functions.invoke("admin-draw", { body: { family_id: FAMILY_ID } });
  $("dashboardNotice").textContent = error ? (data?.error || "Falha no sorteio.") : (data?.message || data?.error || "Sorteio concluído."); await refreshDashboard();
}

window.addEventListener("DOMContentLoaded", async () => {
  if (!client) return;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (hashParams.get("error_code") === "otp_expired") {
    showModal("adminModal");
    $("adminNotice").textContent = "Esse link de recuperação expirou ou já foi usado. Peça outro link e abra-o antes de vencer.";
  }
  const { data } = await client.auth.getSession();
  if (data.session) {
    const { data: adminCheck } = await client.from("admins").select("user_id").eq("user_id", data.session.user.id).maybeSingle();
    if (adminCheck) { $("dashboard").hidden = false; await refreshDashboard(); } else await client.auth.signOut();
  }
  if (participantToken) await loadParticipantArea();
});
