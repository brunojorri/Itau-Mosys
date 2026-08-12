var MotionShelf = MotionShelf || {};

(function (api) {
    var MAX_ITEMS = 2500;
    var MAX_DEPTH = 8;
    var EXTENSIONS = {
        ".aep": "project", ".aet": "project", ".mogrt": "mogrt", ".ffx": "preset",
        ".jsx": "script", ".jsxbin": "script",
        ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image", ".psd": "image", ".ai": "image", ".svg": "image",
        ".mp4": "video", ".mov": "video", ".avi": "video", ".mxf": "video", ".webm": "video",
        ".wav": "audio", ".mp3": "audio", ".aif": "audio", ".aiff": "audio", ".m4a": "audio"
    };
    var PREVIEW_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

    function response(value) {
        try { return JSON.stringify(value); }
        catch (error) { return '{"ok":false,"error":"Falha ao montar resposta."}'; }
    }
    function extensionOf(name) {
        var match = /\.[^\.]+$/.exec(name.toLowerCase());
        return match ? match[0] : "";
    }
    function withoutExtension(name) { return name.replace(/\.[^\.]+$/, ""); }
    function findPreview(file) {
        if (EXTENSIONS[extensionOf(file.name)] === "image") return file.fsName;
        var base = withoutExtension(file.name);
        for (var i = 0; i < PREVIEW_EXTENSIONS.length; i += 1) {
            var candidate = File(file.parent.fsName + "/" + base + PREVIEW_EXTENSIONS[i]);
            if (candidate.exists) return candidate.fsName;
            candidate = File(file.parent.fsName + "/" + base + "_preview" + PREVIEW_EXTENSIONS[i]);
            if (candidate.exists) return candidate.fsName;
        }
        return "";
    }
    function collect(folder, depth, output) {
        if (depth > MAX_DEPTH || output.length >= MAX_ITEMS) return;
        var entries;
        try { entries = folder.getFiles(); }
        catch (_) { return; }
        for (var i = 0; i < entries.length && output.length < MAX_ITEMS; i += 1) {
            var entry = entries[i];
            if (entry instanceof Folder) {
                if (entry.name.charAt(0) !== ".") collect(entry, depth + 1, output);
                continue;
            }
            var ext = extensionOf(entry.name);
            var type = EXTENSIONS[ext];
            if (!type) continue;
            output.push({
                name: entry.name,
                path: entry.fsName,
                ext: ext,
                type: type,
                size: entry.length || 0,
                modified: entry.modified ? entry.modified.getTime() : 0,
                previewPath: findPreview(entry)
            });
        }
    }
    function scan(path) {
        var folder = Folder(path);
        if (!folder.exists) return { ok: false, error: "A pasta não existe ou está indisponível." };
        var items = [];
        collect(folder, 0, items);
        items.sort(function (a, b) {
            var left = a.name.toLowerCase(), right = b.name.toLowerCase();
            return left < right ? -1 : left > right ? 1 : 0;
        });
        return { ok: true, path: folder.fsName, items: items, truncated: items.length >= MAX_ITEMS };
    }
    function ensureProject() {
        if (!app.project) app.newProject();
    }
    function importFile(file) {
        ensureProject();
        var options = new ImportOptions(file);
        try {
            if (options.canImportAs(ImportAsType.PROJECT)) options.importAs = ImportAsType.PROJECT;
        } catch (_) {}
        app.project.importFile(options);
    }
    function applyPreset(file) {
        ensureProject();
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) throw new Error("Abra uma composição e selecione ao menos uma camada.");
        var layers = comp.selectedLayers;
        if (!layers || layers.length === 0) throw new Error("Selecione ao menos uma camada para aplicar o preset.");
        layers[0].applyPreset(file);
    }
    function executeScript(file) {
        if (!file.exists) throw new Error("Script não encontrado.");
        $.evalFile(file);
    }

    api.chooseFolder = function () {
        try {
            var folder = Folder.selectDialog("Escolha a pasta da sua biblioteca");
            if (!folder) return response({ ok: false, cancelled: true });
            return response(scan(folder.fsName));
        } catch (error) {
            return response({ ok: false, error: error.toString() });
        }
    };
    api.scanFolder = function (path) {
        try { return response(scan(path)); }
        catch (error) { return response({ ok: false, error: error.toString() }); }
    };
    api.useAsset = function (path) {
        var file = File(path);
        if (!file.exists) return response({ ok: false, error: "Arquivo não encontrado." });
        var ext = extensionOf(file.name);
        app.beginUndoGroup("Motion Shelf: " + file.name);
        try {
            if (ext === ".ffx") {
                applyPreset(file);
                return response({ ok: true, message: "Preset aplicado às camadas selecionadas." });
            }
            if (ext === ".jsx" || ext === ".jsxbin") {
                executeScript(file);
                return response({ ok: true, message: "Script executado." });
            }
            importFile(file);
            return response({ ok: true, message: ext === ".mogrt" ? "MOGRT enviado ao importador do After Effects." : "Arquivo importado no projeto." });
        } catch (error) {
            return response({ ok: false, error: error.toString() });
        } finally {
            app.endUndoGroup();
        }
    };
}(MotionShelf));
