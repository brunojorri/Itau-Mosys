(function () {
  "use strict";

  var CONFIG = { brandName: "Ita\u00fa Mosys", storagePrefix: "motionShelf.v1", introDuration: 5200, apiBase: "https://itau-mosys-plugin-api.brunojorri.workers.dev", activationBase: "https://itau-mosys-portal.brunojorri.workers.dev/api/plugin/activate" };
  var state = {
    folder: "",
    currentFolder: "",
    items: [],
    favorites: readJSON(CONFIG.storagePrefix + ".favorites", []),
    tab: "library",
    listView: localStorage.getItem(CONFIG.storagePrefix + ".listView") === "true",
    query: "",
    accessToken: localStorage.getItem("motionShelf.v1.accessToken") || ""
  };
  var el = {};
  var toastTimer = null;
  var activeScan = null;
  var introTimer = null;

  function byId(id) { return document.getElementById(id); }
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  }
  function hostCall(expression, callback) {
    if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) {
      callback(JSON.stringify({ ok: false, error: "Abra este painel dentro do After Effects." }));
      return;
    }
    window.__adobe_cep__.evalScript(expression, callback);
  }
  function parseHostResult(raw) {
    if (!raw || raw === "EvalScript error.") return { ok: false, error: "O After Effects não respondeu." };
    try { return JSON.parse(raw); }
    catch (_) { return { ok: false, error: String(raw) }; }
  }
  function quote(value) { return JSON.stringify(String(value)); }
  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch];
    });
  }
  function basename(path) {
    var bits = String(path).replace(/\\/g, "/").split("/");
    return bits[bits.length - 1] || path;
  }
  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    var units = ["B", "KB", "MB", "GB"];
    var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
    return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index];
  }
  function labelFor(item) {
    var labels = { folder: "PASTA", project: "PROJETO", preset: "PRESET", script: "SCRIPT", image: "IMAGEM", video: "VÍDEO", audio: "ÁUDIO", mogrt: "MOGRT", asset: "ARQUIVO" };
    return labels[item.type] || "ARQUIVO";
  }
  function glyphFor(item) {
    var glyphs = { folder: "▰", project: "Ae", preset: "fx", script: "JS", image: "▧", video: "▶", audio: "♪", mogrt: "MG", asset: "◇" };
    return glyphs[item.type] || "◇";
  }
  function showToast(message, isError) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.className = "show" + (isError ? " error" : "");
    toastTimer = setTimeout(function () { el.toast.className = ""; }, 4200);
  }
  function setBusy(message) { el.status.textContent = message || "Trabalhando..."; }
  function assetKey(asset) {
    if (asset.type === "MOGRT") return "assets/mogrts/" + asset.tag + "/" + asset.fileName;
    if (asset.type === "Imagem") return "assets/svgs/" + asset.fileName;
    return "assets/videos/" + asset.fileName;
  }
  function extensionOf(name) {
    var match = /\.[^\.]+$/.exec(String(name).toLowerCase());
    return match ? match[0] : "";
  }
  function randomHex(bytes) {
    var values = new Uint8Array(bytes);
    window.crypto.getRandomValues(values);
    return Array.prototype.map.call(values, function (value) { return value.toString(16).padStart(2, "0"); }).join("");
  }
  function remoteItem(asset) {
    var key = assetKey(asset);
    var type = asset.type === "MOGRT" ? "mogrt" : asset.type === "Vídeo" ? "video" : "image";
    return { path: "r2://" + key, remoteKey: key, name: asset.name, ext: extensionOf(asset.fileName), size: 0, displaySize: asset.size, type: type, previewPath: "", posterPath: "" };
  }

  function closeIntro() {
    if (!el.intro || el.intro.className.indexOf("is-closing") !== -1) return;
    clearTimeout(introTimer);
    el.intro.className += " is-closing";
    setTimeout(function () {
      if (el.intro && el.intro.parentNode) el.intro.parentNode.removeChild(el.intro);
    }, 360);
  }

  function startIntro() {
    var video = el.introVideo;
    if (!video) return;
    video.addEventListener("ended", closeIntro);
    video.addEventListener("error", closeIntro);
    introTimer = setTimeout(closeIntro, CONFIG.introDuration);
    var playback = video.play();
    if (playback && playback.catch) playback.catch(function () {});
  }

  function chooseFolder() {
    if (!window.cep || !window.cep.fs || !window.cep.fs.showOpenDialog) {
      showToast("O seletor de pastas do After Effects não está disponível.", true);
      return;
    }
    var result;
    try {
      result = window.cep.fs.showOpenDialog(false, true, "Escolha a pasta da sua biblioteca", state.folder || "", []);
    } catch (error) {
      showToast(error.message || String(error), true);
      return;
    }
    if (!result || result.err !== 0 || !result.data || !result.data.length) return;
    state.folder = result.data[0];
    state.currentFolder = state.folder;
    localStorage.setItem(CONFIG.storagePrefix + ".folder", state.folder);
    el.folderName.textContent = basename(state.currentFolder);
    el.folderPath.textContent = state.currentFolder;
    refresh();
  }

  function refresh() {
    if (!state.accessToken) { el.status.textContent = "Conexão necessária"; render(); return; }
    if (!window.MotionShelfScanner || !window.MotionShelfScanner.remoteRequest) { el.status.textContent = "Leitor indisponível"; return; }
    setBusy("Atualizando biblioteca…");
    window.MotionShelfScanner.remoteRequest("GET", CONFIG.apiBase + "/catalog", state.accessToken, null, function (result) {
      if (!result.ok || !result.data || !result.data.length) {
        state.accessToken = "";
        localStorage.removeItem(CONFIG.storagePrefix + ".accessToken");
        el.status.textContent = "Conexão necessária";
        render();
        showToast((result.data && result.data.error) || result.error || "Conecte o plugin novamente.", true);
        return;
      }
      state.folder = "Motion System";
      state.currentFolder = state.folder;
      acceptItems(result.data.map(remoteItem), false, state.folder);
    });
  }

  function acceptItems(items, truncated, path) {
    state.items = items;
    state.currentFolder = path || state.currentFolder || state.folder;
    el.folderName.textContent = basename(state.currentFolder);
    el.folderPath.textContent = state.currentFolder;
    el.upFolder.disabled = samePath(state.currentFolder, state.folder);
    el.status.textContent = truncated ? "Biblioteca atualizada (limite de 3.500)" : "Biblioteca atualizada";
    render();
  }

  function normalizedPath(path) { return String(path || "").replace(/\//g, "\\").replace(/[\\]+$/, "").toLowerCase(); }
  function samePath(left, right) { return normalizedPath(left) === normalizedPath(right); }
  function parentPath(path) {
    var clean = String(path || "").replace(/[\\\/]+$/, "");
    return clean.replace(/[\\\/][^\\\/]+$/, "");
  }
  function openFolder(path) {
    var target = normalizedPath(path), root = normalizedPath(state.folder);
    if (target !== root && target.indexOf(root + "\\") !== 0) return;
    state.currentFolder = path;
    state.query = "";
    el.search.value = "";
    refresh();
  }
  function goUp() {
    if (!state.currentFolder || samePath(state.currentFolder, state.folder)) return;
    var parent = parentPath(state.currentFolder);
    openFolder(normalizedPath(parent).indexOf(normalizedPath(state.folder)) === 0 ? parent : state.folder);
  }

  function visibleItems() {
    var query = state.query.toLowerCase();
    return state.items.filter(function (item) {
      var favoriteMatch = state.tab !== "favorites" || state.favorites.indexOf(item.path) !== -1;
      var searchMatch = !query || item.name.toLowerCase().indexOf(query) !== -1 || item.type.toLowerCase().indexOf(query) !== -1;
      return favoriteMatch && searchMatch;
    });
  }

  function render() {
    var items = visibleItems();
    el.favoriteCount.textContent = state.favorites.length;
    el.itemCount.textContent = items.length + (items.length === 1 ? " item" : " itens");
    el.assetGrid.className = "asset-grid" + (state.listView ? " list" : "");
    el.viewToggle.textContent = state.listView ? "▤" : "▦";
    el.emptyState.hidden = !!state.folder && items.length > 0;
    el.assetGrid.hidden = !state.folder || items.length === 0;

    if (state.folder && !items.length) {
      el.emptyState.querySelector("h2").textContent = state.tab === "favorites" ? "Nenhum favorito" : "Nenhum asset encontrado";
      el.emptyState.querySelector("p").textContent = state.query ? "Tente uma busca diferente." : "A pasta não contém arquivos compatíveis.";
    } else if (!state.folder) {
      el.emptyState.querySelector("h2").textContent = "Sua biblioteca, do seu jeito";
      el.emptyState.querySelector("p").textContent = "Selecione uma pasta com projetos, presets, scripts, imagens, vídeos ou áudios.";
    }

    el.assetGrid.innerHTML = items.map(cardHTML).join("");
    Array.prototype.forEach.call(el.assetGrid.querySelectorAll(".asset-card"), bindCard);
    loadPreviews();
  }

  function cardHTML(item) {
    var favorite = state.favorites.indexOf(item.path) !== -1;
    var isFolder = item.type === "folder";
    var info = isFolder ? "" : item.ext.toUpperCase().replace(".", "") + " · " + (item.displaySize || formatBytes(item.size));
    return '<article class="asset-card' + (isFolder ? " folder-card" : "") + '" data-path="' + escapeHTML(item.path) + '" data-type="' + escapeHTML(item.type) + '" title="' + escapeHTML(item.path) + '">' +
      '<div class="thumb">' +
        '<span class="file-glyph">' + escapeHTML(glyphFor(item)) + '</span>' +
        '<span class="type-badge">' + escapeHTML(labelFor(item)) + '</span>' +
        (isFolder ? "" : '<button class="favorite' + (favorite ? " active" : "") + '" title="Favoritar">' + (favorite ? "★" : "☆") + '</button>') +
        (item.previewKind === "video" || item.previewKind === "animated-image" ? '<span class="hover-play">▶</span>' : "") +
      '</div>' +
      '<div class="card-meta">' +
        '<div class="file-name">' + escapeHTML(item.name) + '</div>' +
        '<div class="file-info">' + escapeHTML(info) + '</div>' +
        '<button class="open-btn" title="' + (isFolder ? "Abrir pasta" : "Usar no After Effects") + '">' + (isFolder ? "›" : "↗") + '</button>' +
      '</div>' +
      (item.previewPath || item.posterPath ? '<i class="preview-path" data-preview="' + escapeHTML(item.previewPath || "") + '" data-poster="' + escapeHTML(item.posterPath || "") + '" data-kind="' + escapeHTML(item.previewKind || "image") + '"></i>' : '') +
    '</article>';
  }

  function bindCard(card) {
    var path = card.getAttribute("data-path");
    var isFolder = card.getAttribute("data-type") === "folder";
    var favoriteButton = card.querySelector(".favorite");
    if (favoriteButton) favoriteButton.addEventListener("click", function (event) { event.stopPropagation(); toggleFavorite(path); });
    card.querySelector(".open-btn").addEventListener("click", function (event) {
      event.stopPropagation();
      if (isFolder) openFolder(path); else useAsset(path);
    });
    card.addEventListener("dblclick", function () { if (isFolder) openFolder(path); else useAsset(path); });
  }

  function fileURL(path) {
    return encodeURI("file:///" + String(path).replace(/\\/g, "/")).replace(/#/g, "%23").replace(/\?/g, "%3F");
  }

  function loadPreviews() {
    var holders = el.assetGrid.querySelectorAll(".preview-path");
    function load(holder) {
      if (!holder || holder.getAttribute("data-loaded")) return;
      holder.setAttribute("data-loaded", "1");
      var kind = holder.getAttribute("data-kind");
      var path = holder.getAttribute("data-preview");
      var posterPath = holder.getAttribute("data-poster");
      var card = holder.parentNode;
      var thumb = card.querySelector(".thumb");
      if (kind === "video") {
        var video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.preload = "metadata";
        video.setAttribute("playsinline", "playsinline");
        if (posterPath) video.poster = fileURL(posterPath);
        video.src = fileURL(path);
        thumb.insertBefore(video, thumb.firstChild);
        video.addEventListener("loadedmetadata", function () {
          try { video.currentTime = Math.min(0.08, Math.max(0, video.duration / 10)); } catch (_) {}
        });
        card.addEventListener("mouseenter", function () {
          var playResult = video.play();
          if (playResult && playResult.catch) playResult.catch(function () {});
        });
        card.addEventListener("mouseleave", function () {
          video.pause();
          try { video.currentTime = Math.min(0.08, Math.max(0, video.duration / 10)); } catch (_) {}
        });
        return;
      }
      if (kind === "animated-image") {
        card.addEventListener("mouseenter", function () {
          if (thumb.querySelector("img")) return;
          var animatedImage = document.createElement("img");
          animatedImage.alt = "";
          animatedImage.src = fileURL(path);
          thumb.insertBefore(animatedImage, thumb.firstChild);
        });
        card.addEventListener("mouseleave", function () {
          var animatedImage = thumb.querySelector("img");
          if (animatedImage) thumb.removeChild(animatedImage);
        });
        return;
      }
      var image = document.createElement("img");
      image.alt = "";
      image.src = fileURL(posterPath || path);
      thumb.insertBefore(image, thumb.firstChild);
    }
    if (window.IntersectionObserver) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { load(entry.target); observer.unobserve(entry.target); }
        });
      }, { root: el.assetGrid.parentNode, rootMargin: "300px" });
      Array.prototype.forEach.call(holders, function (holder) { observer.observe(holder); });
    } else {
      Array.prototype.forEach.call(holders, load);
    }
  }

  function toggleFavorite(path) {
    var index = state.favorites.indexOf(path);
    if (index === -1) state.favorites.push(path); else state.favorites.splice(index, 1);
    localStorage.setItem(CONFIG.storagePrefix + ".favorites", JSON.stringify(state.favorites));
    render();
  }

  function useAsset(path) {
    var item = state.items.filter(function (candidate) { return candidate.path === path; })[0];
    if (item && item.remoteKey) {
      if (!window.MotionShelfScanner || !window.MotionShelfScanner.downloadRemoteAsset) { showToast("Download remoto indisponível.", true); return; }
      setBusy("Baixando asset…");
      window.MotionShelfScanner.downloadRemoteAsset(CONFIG.apiBase, state.accessToken, item.remoteKey, function (downloaded) {
        if (!downloaded || !downloaded.ok) { el.status.textContent = "Download não concluído"; showToast((downloaded && downloaded.error) || "Não foi possível baixar o asset.", true); return; }
        item.path = downloaded.path;
        delete item.remoteKey;
        useAsset(downloaded.path);
      });
      return;
    }
    if (item && item.type === "mogrt") {
      if (!window.MotionShelfScanner || !window.MotionShelfScanner.prepareMogrt) {
        showToast("O preparador de MOGRT não está disponível. Feche e reabra o painel.", true);
        return;
      }
      setBusy("Preparando MOGRT...");
      window.MotionShelfScanner.prepareMogrt(path, function (prepared) {
        if (!prepared || !prepared.ok) {
          el.status.textContent = "Ação não concluída";
          showToast((prepared && prepared.error) || "Não foi possível preparar o MOGRT.", true);
          return;
        }
        setBusy("Importando projeto do MOGRT...");
        hostCall("MotionShelf.useAsset(" + quote(prepared.projectPath) + ")", function (raw) {
          var result = parseHostResult(raw);
          el.status.textContent = result.ok ? "Pronto" : "Ação não concluída";
          showToast(result.ok ? "MOGRT importado como projeto editável do After Effects." : (result.message || result.error || "Não foi possível importar o MOGRT."), !result.ok);
        });
      });
      return;
    }
    var verb = item && item.type === "preset" ? "Aplicando preset..." : item && item.type === "script" ? "Executando script..." : "Importando...";
    setBusy(verb);
    hostCall("MotionShelf.useAsset(" + quote(path) + ")", function (raw) {
      var result = parseHostResult(raw);
      el.status.textContent = result.ok ? "Pronto" : "Ação não concluída";
      showToast(result.message || result.error || "Concluído", !result.ok);
    });
  }

  function pairPlugin() {
    if (!window.MotionShelfScanner || !window.MotionShelfScanner.remoteRequest) { showToast("Conexão remota indisponível.", true); return; }
    var device = window.crypto.randomUUID ? window.crypto.randomUUID() : randomHex(16);
    var secret = randomHex(32);
    var activationUrl = CONFIG.activationBase + "?device=" + encodeURIComponent(device) + "&secret=" + encodeURIComponent(secret);
    if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) window.cep.util.openURLInDefaultBrowser(activationUrl);
    else window.open(activationUrl, "_blank");
    setBusy("Aguardando autorização no navegador…");
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      window.MotionShelfScanner.remoteRequest("POST", CONFIG.apiBase + "/session", "", { device: device, secret: secret }, function (result) {
        if (result.ok && result.data && result.data.token) {
          clearInterval(timer);
          state.accessToken = result.data.token;
          localStorage.setItem(CONFIG.storagePrefix + ".accessToken", state.accessToken);
          showToast("Computador autorizado.");
          refresh();
        } else if (attempts >= 90) {
          clearInterval(timer);
          el.status.textContent = "Conexão não concluída";
          showToast("A ativação expirou. Tente conectar novamente.", true);
        }
      });
    }, 2000);
  }

  function loadOfficialLibrary() {
    el.folderName.textContent = "Motion System";
    el.folderPath.textContent = state.accessToken ? "Cloudflare R2" : "Conecte este computador";
    if (state.accessToken) refresh(); else { el.status.textContent = "Conexão necessária"; render(); }
  }

  function init() {
    ["intro", "introVideo", "brandName", "search", "refresh", "connect", "viewToggle", "scale", "upFolder", "folderName", "folderPath", "assetGrid", "emptyState", "status", "itemCount", "favoriteCount", "toast"].forEach(function (id) { el[id] = byId(id); });
    el.brandName.textContent = CONFIG.brandName;
    el.refresh.addEventListener("click", refresh);
    el.connect.addEventListener("click", pairPlugin);
    el.upFolder.addEventListener("click", goUp);
    el.search.addEventListener("input", function () { state.query = this.value; render(); });
    el.viewToggle.addEventListener("click", function () {
      state.listView = !state.listView;
      localStorage.setItem(CONFIG.storagePrefix + ".listView", String(state.listView));
      render();
    });
    el.scale.addEventListener("input", function () { document.documentElement.style.setProperty("--card-size", this.value + "px"); });
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (tab) {
      tab.addEventListener("click", function () {
        state.tab = tab.getAttribute("data-tab");
        Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (node) { node.classList.toggle("active", node === tab); });
        render();
      });
    });
    render();
    loadOfficialLibrary();
    startIntro();
  }

  document.addEventListener("DOMContentLoaded", init);
}());
