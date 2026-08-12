(function (root) {
  "use strict";

  var TYPES = {
    ".aep": "project", ".aet": "project", ".mogrt": "mogrt", ".ffx": "preset",
    ".jsx": "script", ".jsxbin": "script",
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image",
    ".psd": "image", ".ai": "image", ".svg": "image", ".tif": "image", ".tiff": "image",
    ".mp4": "video", ".mov": "video", ".avi": "video", ".mxf": "video", ".webm": "video",
    ".wav": "audio", ".mp3": "audio", ".aif": "audio", ".aiff": "audio", ".m4a": "audio"
  };
  var VIDEO_PREVIEWS = [".mp4", ".webm", ".mov"];
  var IMAGE_PREVIEWS = [".gif", ".webp", ".png", ".jpg", ".jpeg"];

  function getNodeRequire() {
    if (typeof require === "function") return require;
    if (root.cep_node && typeof root.cep_node.require === "function") return root.cep_node.require;
    return null;
  }
  function extensionOf(name) {
    var match = /\.[^\.]+$/.exec(String(name).toLowerCase());
    return match ? match[0] : "";
  }
  function withoutExtension(name) { return String(name).replace(/\.[^\.]+$/, ""); }

  function createScanner(nodeRequire) {
    var fs;
    var pathUtil;
    var zlib;
    var os;
    var crypto;
    try {
      fs = nodeRequire && nodeRequire("fs");
      pathUtil = nodeRequire && nodeRequire("path");
      zlib = nodeRequire && nodeRequire("zlib");
      os = nodeRequire && nodeRequire("os");
      crypto = nodeRequire && nodeRequire("crypto");
    }
    catch (_) {}

    function zipEntries(buffer) {
      var eocd = -1;
      for (var offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
      }
      if (eocd < 0) throw new Error("Pacote ZIP inválido.");
      var total = buffer.readUInt16LE(eocd + 10);
      var cursor = buffer.readUInt32LE(eocd + 16);
      var output = [];
      for (var index = 0; index < total; index += 1) {
        if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Índice ZIP inválido.");
        var nameLength = buffer.readUInt16LE(cursor + 28);
        var extraLength = buffer.readUInt16LE(cursor + 30);
        var commentLength = buffer.readUInt16LE(cursor + 32);
        output.push({
          name: buffer.slice(cursor + 46, cursor + 46 + nameLength).toString("utf8").replace(/\\/g, "/"),
          method: buffer.readUInt16LE(cursor + 10),
          compressedSize: buffer.readUInt32LE(cursor + 20),
          localOffset: buffer.readUInt32LE(cursor + 42)
        });
        cursor += 46 + nameLength + extraLength + commentLength;
      }
      return output;
    }

    function zipEntryData(buffer, entry) {
      var offset = entry.localOffset;
      if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error("Entrada ZIP inválida.");
      var dataStart = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
      var compressed = buffer.slice(dataStart, dataStart + entry.compressedSize);
      if (entry.method === 0) return compressed;
      if (entry.method === 8) return zlib.inflateRawSync(compressed);
      throw new Error("Compressão do MOGRT não suportada.");
    }

    function findZipEntry(buffer, wantedName) {
      var wanted = wantedName.toLowerCase();
      var entries = zipEntries(buffer);
      for (var index = 0; index < entries.length; index += 1) {
        if (entries[index].name.toLowerCase() === wanted || entries[index].name.toLowerCase().slice(-(wanted.length + 1)) === "/" + wanted) return entries[index];
      }
      return null;
    }

    function cacheKey(filePath) {
      return crypto.createHash("md5").update(String(filePath).toLowerCase()).digest("hex");
    }

    function extractMogrtPreviews(item, done) {
      var cacheRoot = pathUtil.join(os.tmpdir(), "motion-shelf-previews");
      var key = cacheKey(item.path);
      var pngPath = pathUtil.join(cacheRoot, key + ".png");
      var mp4Path = pathUtil.join(cacheRoot, key + ".mp4");
      fs.mkdir(cacheRoot, { recursive: true }, function () {
        if (fs.existsSync(pngPath)) item.posterPath = pngPath;
        if (fs.existsSync(mp4Path)) { item.previewPath = mp4Path; item.previewKind = "video"; }
        if (item.posterPath && item.previewPath) { done(); return; }
        fs.readFile(item.path, function (error, buffer) {
          if (error) { done(); return; }
          try {
            var pngEntry = findZipEntry(buffer, "thumb.png");
            var mp4Entry = findZipEntry(buffer, "thumb.mp4");
            if (pngEntry) { fs.writeFileSync(pngPath, zipEntryData(buffer, pngEntry)); item.posterPath = pngPath; }
            if (mp4Entry) { fs.writeFileSync(mp4Path, zipEntryData(buffer, mp4Entry)); item.previewPath = mp4Path; item.previewKind = "video"; }
          } catch (_) {}
          done();
        });
      });
    }

    function listFolder(folderPath, options, done) {
      options = options || {};
      var cancelled = false;
      var maxItems = options.maxItems || 3500;
      if (!fs || !pathUtil) {
        done({ ok: false, error: "O leitor rápido não foi iniciado. Feche e reabra o After Effects." });
        return { cancel: function () {} };
      }
      fs.readdir(folderPath, { withFileTypes: true }, function (error, entries) {
        if (cancelled) return;
        if (error) { done({ ok: false, error: "A pasta não existe ou está indisponível." }); return; }
        var nameMap = {};
        var consumedPreviews = {};
        var items = [];
        var pendingStats = 0;
        var mogrtQueue = [];
        var activeMogrt = 0;
        var pendingMogrt = 0;
        var finishedAdding = false;

        entries.forEach(function (entry) { nameMap[entry.name.toLowerCase()] = entry.name; });

        function previewFor(name) {
          var ext = extensionOf(name);
          if (TYPES[ext] === "video") return { path: pathUtil.join(folderPath, name), kind: "video" };
          if (TYPES[ext] === "image") return { path: pathUtil.join(folderPath, name), kind: ext === ".gif" ? "animated-image" : "image" };
          var base = withoutExtension(name);
          var lists = [{ values: VIDEO_PREVIEWS, kind: "video" }, { values: IMAGE_PREVIEWS, kind: "image" }];
          for (var listIndex = 0; listIndex < lists.length; listIndex += 1) {
            for (var index = 0; index < lists[listIndex].values.length; index += 1) {
              var candidateKey = (base + "_preview" + lists[listIndex].values[index]).toLowerCase();
              if (nameMap[candidateKey]) {
                consumedPreviews[candidateKey] = true;
                return { path: pathUtil.join(folderPath, nameMap[candidateKey]), kind: lists[listIndex].values[index] === ".gif" ? "animated-image" : lists[listIndex].kind };
              }
              candidateKey = (base + lists[listIndex].values[index]).toLowerCase();
              if (nameMap[candidateKey]) return { path: pathUtil.join(folderPath, nameMap[candidateKey]), kind: lists[listIndex].values[index] === ".gif" ? "animated-image" : lists[listIndex].kind };
            }
          }
          return { path: "", kind: "" };
        }

        function finish() {
          if (cancelled || !finishedAdding || pendingStats || pendingMogrt) return;
          items = items.filter(function (item) { return !consumedPreviews[item.name.toLowerCase()]; });
          items.sort(function (a, b) {
            if (a.type === "folder" && b.type !== "folder") return -1;
            if (a.type !== "folder" && b.type === "folder") return 1;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          });
          done({ ok: true, path: folderPath, items: items.slice(0, maxItems), truncated: items.length > maxItems });
        }

        entries.forEach(function (entry) {
          if (items.length >= maxItems + 100 || entry.name.charAt(0) === "." || entry.name.toLowerCase() === "node_modules") return;
          var ext = extensionOf(entry.name);
          if (!entry.isDirectory() && (!entry.isFile() || !TYPES[ext])) return;
          var preview = entry.isDirectory() ? { path: "", kind: "" } : previewFor(entry.name);
          var item = {
            name: entry.name,
            path: pathUtil.join(folderPath, entry.name),
            ext: entry.isDirectory() ? "" : ext,
            type: entry.isDirectory() ? "folder" : TYPES[ext],
            size: 0,
            modified: 0,
            previewPath: preview.path,
            previewKind: preview.kind,
            posterPath: preview.kind === "image" ? preview.path : ""
          };
          items.push(item);
          if (item.type === "mogrt" && !item.previewPath) mogrtQueue.push(item);
          if (!entry.isDirectory()) {
            pendingStats += 1;
            fs.stat(item.path, function (statError, stat) {
              pendingStats -= 1;
              if (!cancelled && !statError && stat) {
                item.size = stat.size || 0;
                item.modified = stat.mtime ? stat.mtime.getTime() : 0;
              }
              finish();
            });
          }
        });
        finishedAdding = true;
        pendingMogrt = mogrtQueue.length;
        function runMogrtWorkers() {
          while (!cancelled && activeMogrt < 3 && mogrtQueue.length) {
            activeMogrt += 1;
            extractMogrtPreviews(mogrtQueue.shift(), function () {
              activeMogrt -= 1;
              pendingMogrt -= 1;
              if (typeof options.onProgress === "function") options.onProgress({ items: items.length, folders: 1, previews: pendingMogrt });
              runMogrtWorkers();
              finish();
            });
          }
        }
        runMogrtWorkers();
        if (typeof options.onProgress === "function") options.onProgress({ items: items.length, folders: 1 });
        finish();
      });
      return { cancel: function () { cancelled = true; } };
    }

    function prepareMogrt(mogrtPath, done) {
      if (!fs || !pathUtil || !zlib) { done({ ok: false, error: "Leitor de MOGRT indisponível." }); return; }
      fs.readFile(mogrtPath, function (error, outerBuffer) {
        if (error) { done({ ok: false, error: "Não foi possível abrir o MOGRT." }); return; }
        try {
          var projectEntry = findZipEntry(outerBuffer, "project.aegraphic");
          var directEntries = zipEntries(outerBuffer);
          var nestedBuffer = projectEntry ? zipEntryData(outerBuffer, projectEntry) : outerBuffer;
          var nestedEntries = projectEntry ? zipEntries(nestedBuffer) : directEntries;
          var aepEntry = null;
          for (var index = 0; index < nestedEntries.length; index += 1) {
            if (/\.aep$/i.test(nestedEntries[index].name)) { aepEntry = nestedEntries[index]; break; }
          }
          if (!aepEntry) {
            done({ ok: false, error: "Este MOGRT não contém um projeto do After Effects. Ele pode ter sido criado no Premiere Pro." });
            return;
          }
          var stat = fs.statSync(mogrtPath);
          var key = crypto.createHash("md5").update(String(mogrtPath).toLowerCase() + ":" + stat.size + ":" + stat.mtime.getTime()).digest("hex");
          var destination = pathUtil.join(os.tmpdir(), "motion-shelf-mogrt-projects", key);
          fs.mkdirSync(destination, { recursive: true });
          var projectPath = "";
          nestedEntries.forEach(function (entry) {
            if (!entry.name || /\/$/.test(entry.name)) return;
            var target = pathUtil.resolve(destination, entry.name);
            if (target.indexOf(pathUtil.resolve(destination) + pathUtil.sep) !== 0) return;
            fs.mkdirSync(pathUtil.dirname(target), { recursive: true });
            fs.writeFileSync(target, zipEntryData(nestedBuffer, entry));
            if (/\.aep$/i.test(entry.name) && !projectPath) projectPath = target;
          });
          done(projectPath ? { ok: true, projectPath: projectPath } : { ok: false, error: "Projeto interno não encontrado." });
        } catch (extractError) {
          done({ ok: false, error: "Falha ao preparar o MOGRT: " + (extractError.message || String(extractError)) });
        }
      });
    }

    function resolveOfficialLibrary(done) {
      if (!fs || !pathUtil || !os) {
        done({ ok: false, error: "Leitor local indisponivel." });
        return;
      }
      var relativeLibrary = pathUtil.join("Ita\u00fa Digital Craft_", "_MotionSystem");
      var roots = [];
      function addRoot(value) {
        if (value && roots.indexOf(value) === -1) roots.push(value);
      }
      function addDropboxInfo(filePath) {
        try {
          var info = JSON.parse(fs.readFileSync(filePath, "utf8"));
          Object.keys(info).forEach(function (key) {
            if (info[key] && info[key].path) addRoot(info[key].path);
          });
        } catch (_) {}
      }
      var home = os.homedir();
      var appData = (typeof process !== "undefined" && process.env && process.env.APPDATA) || pathUtil.join(home, "AppData", "Roaming");
      addDropboxInfo(pathUtil.join(appData, "Dropbox", "info.json"));
      try {
        fs.readdirSync(home).forEach(function (name) {
          var candidate = pathUtil.join(home, name);
          try {
            if (/dropbox/i.test(name) && fs.statSync(candidate).isDirectory()) addRoot(candidate);
          } catch (_) {}
        });
      } catch (_) {}
      for (var index = 0; index < roots.length; index += 1) {
        var libraryPath = pathUtil.join(roots[index], relativeLibrary);
        try {
          if (fs.statSync(libraryPath).isDirectory()) {
            done({ ok: true, path: libraryPath });
            return;
          }
        } catch (_) {}
      }
      done({ ok: false, error: "Biblioteca oficial nao encontrada. Confirme o Dropbox e a sincronizacao da pasta Motion System." });
    }

    return { available: !!(fs && pathUtil), listFolder: listFolder, scanFolder: listFolder, prepareMogrt: prepareMogrt, resolveOfficialLibrary: resolveOfficialLibrary };
  }

  var api = createScanner(getNodeRequire());
  root.MotionShelfScanner = api;
  if (typeof module === "object" && module.exports) module.exports = { createScanner: createScanner, scanner: api };
}(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this)));
