/**
 * =========================================================================
 * LAUSTORE INVENTARIO - CONTROLADOR FRONTEND (MOBILE-FIRST)
 * =========================================================================
 */

(function () {
  "use strict";

  // Estado global de la sesión y de la prenda en curso
  const state = {
    operator: "",
    branch: "",
    pin: "",
    imageBase64: null,
    imageMimeType: "image/jpeg",
    audioBase64: null,
    audioMimeType: null,
    mediaRecorder: null,
    wavRecorder: null,
    audioChunks: [],
    recordInterval: null,
    recordSeconds: 0,
    recordingPhase: "idle",
    audioObjectUrl: null,
    audioPreviewFallbackUsed: false,
    excelExportUrl: null
  };

  // Elementos DOM
  const dom = {
    // Auth
    authModal: document.getElementById("authModal"),
    authForm: document.getElementById("authForm"),
    inputOperador: document.getElementById("inputOperador"),
    inputSucursal: document.getElementById("inputSucursal"),
    inputPin: document.getElementById("inputPin"),
    authErrorMsg: document.getElementById("authErrorMsg"),
    btnAuthSubmit: document.getElementById("btnAuthSubmit"),
    mainApp: document.getElementById("mainApp"),
    labelOperatorInfo: document.getElementById("labelOperatorInfo"),
    btnLogout: document.getElementById("btnLogout"),
    btnExportExcel: document.getElementById("btnExportExcel"),

    // Photo
    cameraInput: document.getElementById("cameraInput"),
    galleryInput: document.getElementById("galleryInput"),
    btnTriggerCamera: document.getElementById("btnTriggerCamera"),
    btnTriggerGallery: document.getElementById("btnTriggerGallery"),
    photoPreviewBox: document.getElementById("photoPreviewBox"),
    captureButtonsRow: document.getElementById("captureButtonsRow"),
    imgPreview: document.getElementById("imgPreview"),
    btnRetakePhoto: document.getElementById("btnRetakePhoto"),
    photoSizeBadge: document.getElementById("photoSizeBadge"),

    // Voice
    btnRecordToggle: document.getElementById("btnRecordToggle"),
    voiceStatusText: document.getElementById("voiceStatusText"),
    recordTimer: document.getElementById("recordTimer"),
    audioPlaybackBox: document.getElementById("audioPlaybackBox"),
    audioElement: document.getElementById("audioElement"),
    btnDiscardAudio: document.getElementById("btnDiscardAudio"),

    // AI & Actions
    btnAnalyzeAI: document.getElementById("btnAnalyzeAI"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingMessage: document.getElementById("loadingMessage"),

    // Confirmation Form
    stepConfirmation: document.getElementById("stepConfirmation"),
    voiceTranscriptBox: document.getElementById("voiceTranscriptBox"),
    voiceTranscriptText: document.getElementById("voiceTranscriptText"),
    itemForm: document.getElementById("itemForm"),
    itemCodigoPrincipal: document.getElementById("itemCodigoPrincipal"),
    itemCodigoAuxiliar: document.getElementById("itemCodigoAuxiliar"),
    itemCantidad: document.getElementById("itemCantidad"),
    itemProveedor: document.getElementById("itemProveedor"),
    itemTalla: document.getElementById("itemTalla"),
    itemDescripcion: document.getElementById("itemDescripcion"),
    itemColor: document.getElementById("itemColor"),
    itemCaracteristicas: document.getElementById("itemCaracteristicas"),
    itemPrecioCompra: document.getElementById("itemPrecioCompra"),
    itemPrecioVenta: document.getElementById("itemPrecioVenta"),
    metaOperador: document.getElementById("metaOperador"),
    metaSucursal: document.getElementById("metaSucursal"),
    saveErrorMsg: document.getElementById("saveErrorMsg"),
    btnSaveInventory: document.getElementById("btnSaveInventory"),

    // Success Modal
    successModal: document.getElementById("successModal"),
    successCodeBadge: document.getElementById("successCodeBadge"),
    successRowBadge: document.getElementById("successRowBadge"),
    successDriveLink: document.getElementById("successDriveLink"),
    driveLinkRow: document.getElementById("driveLinkRow"),
    btnNextItem: document.getElementById("btnNextItem"),
    btnModalExcel: document.getElementById("btnModalExcel")
  };

  // =========================================================================
  // 1. INICIALIZACIÓN Y SESIÓN DEL OPERADOR
  // =========================================================================
  function init() {
    loadSavedSession();
    bindEvents();
  }

  function loadSavedSession() {
    const savedOp = localStorage.getItem("lau_op_name");
    const savedBranch = localStorage.getItem("lau_op_branch");
    const savedPin = localStorage.getItem("lau_op_pin");

    if (savedOp && savedBranch && savedPin) {
      state.operator = savedOp;
      state.branch = savedBranch;
      state.pin = savedPin;
      showApp();
    } else {
      showAuth();
    }
  }

  function showAuth() {
    dom.authModal.style.display = "flex";
    dom.mainApp.style.display = "none";
  }

  function showApp() {
    dom.authModal.style.display = "none";
    dom.mainApp.style.display = "block";
    dom.labelOperatorInfo.textContent = `${state.operator} (${state.branch})`;
    dom.metaOperador.textContent = state.operator;
    dom.metaSucursal.textContent = state.branch;
  }

  function handleLogout() {
    if (confirm("¿Deseas cerrar la sesión del operador actual?")) {
      localStorage.removeItem("lau_op_name");
      localStorage.removeItem("lau_op_branch");
      localStorage.removeItem("lau_op_pin");
      state.operator = "";
      state.branch = "";
      state.pin = "";
      resetCurrentItem();
      showAuth();
    }
  }

  // =========================================================================
  // 2. EVENTOS DOM
  // =========================================================================
  function bindEvents() {
    // Auth Form
    dom.authForm.addEventListener("submit", onAuthSubmit);
    dom.btnLogout.addEventListener("click", handleLogout);
    dom.btnExportExcel.addEventListener("click", onExportExcelClick);
    dom.btnModalExcel.addEventListener("click", onExportExcelClick);

    // Photo Triggers
    dom.btnTriggerCamera.addEventListener("click", () => dom.cameraInput.click());
    dom.btnTriggerGallery.addEventListener("click", () => dom.galleryInput.click());
    dom.cameraInput.addEventListener("change", onFileSelected);
    dom.galleryInput.addEventListener("change", onFileSelected);
    dom.btnRetakePhoto.addEventListener("click", resetPhoto);

    // Voice Recorder
    dom.btnRecordToggle.addEventListener("click", toggleVoiceRecording);
    dom.btnDiscardAudio.addEventListener("click", discardAudio);
    dom.audioElement.addEventListener("error", () => {
      if (!state.audioBase64) return;
      if (!state.audioPreviewFallbackUsed) {
        // Safari puede rechazar la URL blob aunque el audio esté disponible.
        state.audioPreviewFallbackUsed = true;
        dom.audioElement.src = state.audioBase64;
        dom.audioElement.load();
        return;
      }
      dom.audioPlaybackBox.style.display = "none";
      dom.voiceStatusText.textContent = "Audio capturado. La vista previa no está disponible; puedes analizarlo o volver a grabar.";
      console.warn("Safari no pudo reproducir la vista previa del audio grabado.");
    });

    // AI Analyze
    dom.btnAnalyzeAI.addEventListener("click", onAnalyzeAIClick);

    // Form Save
    dom.itemForm.addEventListener("submit", onSaveInventorySubmit);

    // Next item
    dom.btnNextItem.addEventListener("click", resetCurrentItem);
  }

  // =========================================================================
  // 3. AUTENTICACIÓN POR PIN CON NETLIFY FUNCTION
  // =========================================================================
  async function onAuthSubmit(e) {
    e.preventDefault();
    dom.authErrorMsg.style.display = "none";
    dom.btnAuthSubmit.disabled = true;
    dom.btnAuthSubmit.textContent = "Verificando PIN...";

    const op = dom.inputOperador.value.trim();
    const branch = dom.inputSucursal.value;
    const pin = dom.inputPin.value.trim();

    try {
      const res = await fetch("/.netlify/functions/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });

      const data = await res.json();

      if (!res.ok || !data.valid) {
        throw new Error(data.error || "PIN incorrecto");
      }

      // Guardar en sesión
      state.operator = op;
      state.branch = branch;
      state.pin = pin;

      localStorage.setItem("lau_op_name", op);
      localStorage.setItem("lau_op_branch", branch);
      localStorage.setItem("lau_op_pin", pin);

      showApp();

    } catch (err) {
      dom.authErrorMsg.textContent = err.message || "Error al verificar PIN.";
      dom.authErrorMsg.style.display = "block";
    } finally {
      dom.btnAuthSubmit.disabled = false;
      dom.btnAuthSubmit.textContent = "Ingresar al Módulo";
    }
  }

  // =========================================================================
  // 4. CAPTURA Y COMPRESIÓN DE FOTO EN CANVAS (CLIENT-SIDE)
  // =========================================================================
  function onFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = new Image();
      img.onload = function () {
        compressImageToCanvas(img);
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  function compressImageToCanvas(img) {
    // Redimensionar respetando aspect ratio a un máximo de 1280px
    const maxDim = 1280;
    let width = img.width;
    let height = img.height;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    // Comprimir en JPEG a calidad 0.78
    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.78);
    state.imageBase64 = compressedBase64;
    state.imageMimeType = "image/jpeg";

    // Calcular tamaño aproximado
    const sizeKB = Math.round((compressedBase64.length * 3 / 4) / 1024);

    // Actualizar UI
    dom.imgPreview.src = compressedBase64;
    dom.photoSizeBadge.textContent = `${sizeKB} KB (Optimizada)`;
    dom.photoPreviewBox.style.display = "flex";
    dom.captureButtonsRow.style.display = "none";

    // Habilitar botón de IA
    updateAIButtonState();
  }

  function resetPhoto() {
    state.imageBase64 = null;
    dom.cameraInput.value = "";
    dom.galleryInput.value = "";
    dom.imgPreview.src = "";
    dom.photoPreviewBox.style.display = "none";
    dom.captureButtonsRow.style.display = "grid";
    updateAIButtonState();
  }

  // =========================================================================
  // 5. GRABACIÓN DE VOZ COMPATIBLE CON iOS Y ANDROID (MediaRecorder)
  // =========================================================================
  async function toggleVoiceRecording() {
    if (state.recordingPhase === "starting" || state.recordingPhase === "stopping") return;
    if (state.recordingPhase === "recording") {
      stopVoiceRecording();
    } else {
      await startVoiceRecording();
    }
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Tu navegador no soporta grabación de audio desde la web. Puedes ingresar los datos manualmente tras la foto.");
      return;
    }

    if (state.recordingPhase !== "idle") return;
    // Safari en iPhone puede producir grabaciones MP4 sin duración válida.
    // Registrar voz en WAV PCM para evitar archivos MP4 incompletos.
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIos) {
      await startIosWavRecording();
      return;
    }

    state.recordingPhase = "starting";
    dom.btnRecordToggle.disabled = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Detección de tipos MIME compatibles (especialmente para Safari iOS)
      let mimeType = "";
      const candidates = [
        "audio/mp4",
        "audio/aac",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg"
      ];

      for (let cand of candidates) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(cand)) {
          mimeType = cand;
          break;
        }
      }

      const options = mimeType ? { mimeType } : {};
      state.mediaRecorder = new MediaRecorder(stream, options);
      state.audioChunks = [];
      state.audioBase64 = null;
      state.audioPreviewFallbackUsed = false;
      if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
      state.audioObjectUrl = null;
      dom.audioElement.pause();
      dom.audioElement.removeAttribute("src");
      dom.audioElement.load();
      state.audioMimeType = state.mediaRecorder.mimeType || mimeType || "audio/mp4";

      state.mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) {
          state.audioChunks.push(e.data);
        }
      };

      state.mediaRecorder.onerror = function (event) {
        console.error("MediaRecorder error:", event.error || event);
        clearInterval(state.recordInterval);
        stream.getTracks().forEach(track => track.stop());
        state.recordingPhase = "idle";
        state.mediaRecorder = null;
        state.audioBase64 = null;
        dom.btnRecordToggle.disabled = false;
        dom.btnRecordToggle.classList.remove("recording");
        dom.voiceStatusText.textContent = "No se pudo finalizar la grabación. Vuelve a intentarlo.";
      };

      state.mediaRecorder.onstop = function () {
        clearInterval(state.recordInterval);
        stream.getTracks().forEach(track => track.stop());
        state.mediaRecorder = null;
        const audioBlob = new Blob(state.audioChunks, { type: state.audioMimeType });
        if (!audioBlob.size) {
          state.audioBase64 = null;
          state.recordingPhase = "idle";
          dom.btnRecordToggle.disabled = false;
          dom.voiceStatusText.textContent = "La grabación quedó vacía. Vuelve a grabar.";
          return;
        }

        const reader = new FileReader();
        reader.onerror = function () {
          state.audioBase64 = null;
          state.recordingPhase = "idle";
          dom.btnRecordToggle.disabled = false;
          dom.voiceStatusText.textContent = "No se pudo preparar el audio. Vuelve a grabar.";
        };
        reader.onload = function (evt) {
          state.audioBase64 = evt.target.result;
          state.audioObjectUrl = URL.createObjectURL(audioBlob);
          dom.audioElement.src = state.audioObjectUrl;
          dom.audioPlaybackBox.style.display = "flex";
          dom.voiceStatusText.textContent = "Audio grabado y listo para analizar.";
          state.recordingPhase = "idle";
          dom.btnRecordToggle.disabled = false;
        };
        reader.readAsDataURL(audioBlob);
      };

      state.mediaRecorder.start();
      state.recordingPhase = "recording";
      dom.btnRecordToggle.disabled = false;

      // UI en estado grabando
      dom.btnRecordToggle.classList.add("recording");
      dom.voiceStatusText.textContent = "Grabando voz... Habla claro sobre la prenda.";
      dom.recordTimer.style.display = "inline-block";
      dom.recordTimer.textContent = "00:00";
      dom.audioPlaybackBox.style.display = "none";

      state.recordSeconds = 0;
      clearInterval(state.recordInterval);
      state.recordInterval = setInterval(() => {
        state.recordSeconds++;
        const mins = String(Math.floor(state.recordSeconds / 60)).padStart(2, "0");
        const secs = String(state.recordSeconds % 60).padStart(2, "0");
        dom.recordTimer.textContent = `${mins}:${secs}`;

        // Capturas breves para evitar que Gemini exceda el tiempo de Netlify
        if (state.recordSeconds >= 60) {
          stopVoiceRecording();
        }
      }, 1000);

    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      state.recordingPhase = "idle";
      dom.btnRecordToggle.disabled = false;
      alert("No se pudo acceder al micrófono. Comprueba los permisos del navegador.");
    }
  }

  function stopVoiceRecording() {
    if (state.wavRecorder && state.recordingPhase === "recording") {
      stopIosWavRecording();
      return;
    }
    if (state.recordingPhase !== "recording" || !state.mediaRecorder) return;
    state.recordingPhase = "stopping";
    dom.btnRecordToggle.disabled = true;
    dom.voiceStatusText.textContent = "Finalizando grabación...";
    try {
      state.mediaRecorder.stop();
    } catch (err) {
      console.error("Error al detener grabación:", err);
      state.recordingPhase = "idle";
      dom.btnRecordToggle.disabled = false;
      dom.voiceStatusText.textContent = "No se pudo finalizar. Vuelve a grabar.";
    }
    clearInterval(state.recordInterval);
    dom.btnRecordToggle.classList.remove("recording");
    dom.recordTimer.style.display = "none";
  }

  // Grabador de iPhone: PCM mono WAV a 16 kHz, con duración verificable.
  // Un minuto ocupa aprox. 1,9 MB, dentro del límite de carga de Netlify.
  function encodeIosWav(chunks, sampleRate) {
    const totalFrames = chunks.reduce((n, chunk) => n + chunk.length, 0);
    if (totalFrames < sampleRate) throw new Error("Audio vacío o menor a un segundo.");
    const all = new Float32Array(totalFrames);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    const targetRate = 16000;
    const ratio = sampleRate / targetRate;
    const count = Math.floor(totalFrames / ratio);
    const buffer = new ArrayBuffer(44 + count * 2);
    const view = new DataView(buffer);
    const ascii = (at, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(at + i, str.charCodeAt(i));
    };
    ascii(0, "RIFF");
    view.setUint32(4, buffer.byteLength - 8, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i++) {
      const at = Math.min(Math.floor(i * ratio), totalFrames - 1);
      const next = Math.min(at + 1, totalFrames - 1);
      const frac = i * ratio - at;
      const value = Math.max(-1, Math.min(1, all[at] + (all[next] - all[at]) * frac));
      view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  function resetVoicePreview() {
    state.audioBase64 = null;
    state.audioPreviewFallbackUsed = false;
    if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
    state.audioObjectUrl = null;
    dom.audioElement.pause();
    dom.audioElement.removeAttribute("src");
    dom.audioElement.load();
    dom.audioPlaybackBox.style.display = "none";
  }

  function showRecordingUi() {
    dom.btnRecordToggle.classList.add("recording");
    dom.voiceStatusText.textContent = "Grabando voz... Habla claro sobre la prenda.";
    dom.recordTimer.style.display = "inline-block";
    dom.recordTimer.textContent = "00:00";
    dom.audioPlaybackBox.style.display = "none";
    state.recordSeconds = 0;
    clearInterval(state.recordInterval);
    state.recordInterval = setInterval(() => {
      state.recordSeconds++;
      const mm = String(Math.floor(state.recordSeconds / 60)).padStart(2, "0");
      const ss = String(state.recordSeconds % 60).padStart(2, "0");
      dom.recordTimer.textContent = mm + ":" + ss;
      if (state.recordSeconds >= 60) stopVoiceRecording();
    }, 1000);
  }

  async function startIosWavRecording() {
    state.recordingPhase = "starting";
    dom.btnRecordToggle.disabled = true;
    let ctx = null;
    let stream = null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error("Este navegador no permite grabación WAV.");
      // Crear/desbloquear contexto con la pulsación del usuario en iOS.
      ctx = new AudioCtx();
      const contextReady = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      await contextReady;
      if (ctx.state !== "running" || typeof ctx.createScriptProcessor !== "function") {
        throw new Error("El motor de audio está suspendido. Abre el portal directamente en Safari.");
      }

      const input = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      const chunks = [];
      processor.onaudioprocess = (event) => {
        if (state.recordingPhase !== "recording") return;
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      input.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);

      resetVoicePreview();
      state.audioMimeType = "audio/wav";
      state.wavRecorder = { ctx, stream, input, processor, silent, chunks };
      state.recordingPhase = "recording";
      dom.btnRecordToggle.disabled = false;
      showRecordingUi();
    } catch (err) {
      console.error("No se inició la grabación WAV:", err);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (ctx) ctx.close().catch(() => {});
      state.wavRecorder = null;
      state.recordingPhase = "idle";
      dom.btnRecordToggle.disabled = false;
      dom.voiceStatusText.textContent = "No se pudo iniciar la grabación en iPhone.";
      alert((err && err.message) || "No se pudo utilizar el micrófono.");
    }
  }

  function stopIosWavRecording() {
    if (state.recordingPhase !== "recording" || !state.wavRecorder) return;
    state.recordingPhase = "stopping";
    dom.btnRecordToggle.disabled = true;
    dom.btnRecordToggle.classList.remove("recording");
    dom.voiceStatusText.textContent = "Guardando audio...";
    dom.recordTimer.style.display = "none";
    clearInterval(state.recordInterval);

    const wav = state.wavRecorder;
    state.wavRecorder = null;
    wav.processor.onaudioprocess = null;
    wav.input.disconnect();
    wav.processor.disconnect();
    wav.silent.disconnect();
    wav.stream.getTracks().forEach(t => t.stop());
    wav.ctx.close().catch(() => {});

    try {
      const duration = wav.chunks.reduce((n, chunk) => n + chunk.length, 0) / wav.ctx.sampleRate;
      const blob = encodeIosWav(wav.chunks, wav.ctx.sampleRate);
      if (!blob.size || duration < 1) throw new Error("El audio quedó vacío.");
      const reader = new FileReader();
      reader.onerror = () => {
        state.recordingPhase = "idle";
        dom.btnRecordToggle.disabled = false;
        dom.voiceStatusText.textContent = "No se pudo guardar el audio. Vuelve a grabar.";
      };
      reader.onload = (event) => {
        state.audioBase64 = event.target.result;
        state.audioObjectUrl = URL.createObjectURL(blob);
        state.audioMimeType = "audio/wav";
        dom.audioElement.src = state.audioObjectUrl;
        dom.audioElement.load();
        dom.audioPlaybackBox.style.display = "flex";
        dom.voiceStatusText.textContent = "Audio de " + Math.round(duration) + " segundos grabado y listo para analizar.";
        state.recordingPhase = "idle";
        dom.btnRecordToggle.disabled = false;
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Error al generar WAV:", err);
      state.audioBase64 = null;
      state.recordingPhase = "idle";
      dom.btnRecordToggle.disabled = false;
      dom.voiceStatusText.textContent = "No se pudo conservar el audio. Grábalo nuevamente.";
    }
  }

  function discardAudio() {
    state.audioBase64 = null;
    state.audioPreviewFallbackUsed = false;
    state.audioMimeType = null;
    if (state.audioObjectUrl) {
      URL.revokeObjectURL(state.audioObjectUrl);
      state.audioObjectUrl = null;
    }
    dom.audioElement.pause();
    dom.audioElement.removeAttribute("src");
    dom.audioElement.load();
    dom.audioPlaybackBox.style.display = "none";
    dom.voiceStatusText.textContent = "Toca el micrófono para comenzar a dictar";
  }

  function updateAIButtonState() {
    dom.btnAnalyzeAI.disabled = !state.imageBase64;
  }

  function normalizeSizes(value) {
    return String(value || "").toUpperCase().trim()
      .replace(/\b(XXL|XL|XS|S|M|L)\s*[:=]?\s*(\d+)\b/g, "$1:$2");
  }

  // =========================================================================
  // 6. ANÁLISIS MULTIMODAL CON GEMINI API (NETLIFY FUNCTION)
  // =========================================================================
  async function onAnalyzeAIClick() {
    if (!state.imageBase64) return;
    if (state.recordingPhase !== "idle") {
      alert("Primero finaliza la grabación de voz y espera a que quede preparada.");
      return;
    }
 
    showLoading("Analizando fotografía y voz con Gemini IA...");
    dom.btnAnalyzeAI.disabled = true;

    try {
      const payload = {
        pin: state.pin,
        imageBase64: state.imageBase64,
        imageMimeType: state.imageMimeType,
        audioBase64: state.audioBase64,
        audioMimeType: state.audioMimeType,
        operador: state.operator,
        sucursal: state.branch
      };

      const controller = new AbortController();
      const requestTimer = setTimeout(() => controller.abort(), 28000);
      let res;
      try {
        res = await fetch("/.netlify/functions/analyze-item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally {
        clearTimeout(requestTimer);
      }

      // Netlify puede devolver una página HTML de error (por ejemplo un 504).
      // No intentar interpretarla como JSON.
      const rawResponse = await res.text();
      let data = null;
      try { data = JSON.parse(rawResponse); } catch (_) { /* respuesta no JSON */ }
      if (!res.ok || !data || !data.success) {
        if (res.status === 504 || res.status === 502) {
          throw new Error("El servicio de análisis tardó demasiado (HTTP " + res.status + "). Puedes volver a intentarlo con un dictado más breve.");
        }
        throw new Error((data && data.error) || "No se recibió una respuesta válida del análisis. HTTP " + res.status);
      }

      // Confirmar qué información de voz fue realmente entendida.
      if (state.audioBase64 && (!data.audioInterpretado || !data.transcripcionVoz)) {
        throw new Error("El análisis visual funcionó, pero Gemini no confirmó la voz. Vuelve a grabar y escucha el audio antes de analizar.");
      }
      dom.voiceTranscriptBox.style.display = data.audioInterpretado ? "block" : "none";
      dom.voiceTranscriptText.textContent = data.transcripcionVoz || "";
      populateConfirmationForm(data.item);

      // Avisar de campos críticos que aún requieran verificación del operador.
      const faltan = [];
      if (!dom.itemCodigoAuxiliar.value.trim()) faltan.push("código del proveedor");
      if (!dom.itemTalla.value.trim()) faltan.push("talla");
      if (!dom.itemPrecioCompra.value.trim()) faltan.push("precio de compra");
      if (!dom.itemPrecioVenta.value.trim()) faltan.push("precio de venta");
      if (faltan.length && data.audioInterpretado) {
        dom.voiceTranscriptText.textContent += "\n\nRevisa los campos pendientes: " + faltan.join(", ") + ".";
      }

      // Mostrar sección de confirmación y scroll suave hacia ella
      dom.stepConfirmation.style.display = "block";
      dom.stepConfirmation.scrollIntoView({ behavior: "smooth" });

    } catch (err) {
      const errorMessage = err.name === "AbortError"
        ? "La solicitud tardó demasiado en responder. Puedes volver a intentarlo con un dictado más breve."
        : (err.message || "No se pudo completar el análisis.");
      alert(`⚠️ ${errorMessage}\n\nPuedes llenar los campos manualmente a continuación.`);
      // En un fallo de audio no sustituir datos previos ni presentar la foto
      // como si Gemini hubiese escuchado correctamente al operador.
      dom.voiceTranscriptBox.style.display = "none";
      if (dom.stepConfirmation.style.display !== "block") {
        // Mantener la opción manual solo si el usuario decide continuar sin voz.
        dom.stepConfirmation.style.display = "block";
      }
      dom.stepConfirmation.scrollIntoView({ behavior: "smooth" });
    } finally {
      hideLoading();
      dom.btnAnalyzeAI.disabled = false;
    }
  }

  function populateConfirmationForm(item) {
    dom.itemCodigoPrincipal.value = item.codigoPrincipal == null ? "" : String(item.codigoPrincipal); // Conservar el código dictado, incluso "001"
    dom.itemCodigoAuxiliar.value = item.codigoAuxiliar || "";
    dom.itemProveedor.value = item.proveedor || "";
    dom.itemCantidad.value = item.cantidad || 1;
    dom.itemDescripcion.value = item.descripcion || "";
    dom.itemTalla.value = normalizeSizes(item.talla || "");
    const tallasExplicitas = [...dom.itemTalla.value.matchAll(/\b(XXL|XL|XS|S|M|L):(\d+)\b/g)];
    if (tallasExplicitas.length && !item.cantidad) {
      dom.itemCantidad.value = tallasExplicitas.reduce((sum, t) => sum + Number(t[2]), 0);
    }
    dom.itemColor.value = item.color || "";
    dom.itemCaracteristicas.value = item.caracteristicas || "";
    dom.itemPrecioCompra.value = (item.precioCompra !== null && item.precioCompra !== undefined && item.precioCompra !== "") ? item.precioCompra : "";
    dom.itemPrecioVenta.value = (item.precioVenta !== null && item.precioVenta !== undefined && item.precioVenta !== "") ? item.precioVenta : "";
  }

  // =========================================================================
  // 7. GUARDAR EN GOOGLE SHEETS Y DRIVE (NETLIFY FUNCTION + APPS SCRIPT)
  // =========================================================================
  async function onSaveInventorySubmit(e) {
    e.preventDefault();

    // Varias tallas requieren desglose explícito; 3 prendas S/M/L no implican 1 de cada.
    const tallaValue = normalizeSizes(dom.itemTalla.value);
    dom.itemTalla.value = tallaValue;
    const sizes = Array.from(new Set(tallaValue.match(/\b(?:XXL|XL|XS|S|M|L)\b/g) || []));
    const combinedSingleSize = /^(?:XXL|XL|XS|S|M|L)\s*\/\s*(?:XXL|XL|XS|S|M|L)$/.test(tallaValue);
    if (sizes.length > 1 && !combinedSingleSize) {
      const pairs = [...tallaValue.matchAll(/\b(XXL|XL|XS|S|M|L)\s*[:=]\s*(\d+)\b/g)];
      const quantityBySize = new Map(pairs.map(match => [match[1], Number(match[2])]));
      const total = [...quantityBySize.values()].reduce((acc, qty) => acc + qty, 0);
      if (quantityBySize.size !== sizes.length || total !== Number(dom.itemCantidad.value)) {
        dom.saveErrorMsg.textContent = "Indica la cantidad por talla (ej.: S:1, M:1, L:1) y verifica que la suma coincida con la cantidad física. No se asignarán cantidades por suposición.";
        dom.saveErrorMsg.style.display = "block";
        dom.saveErrorMsg.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    dom.saveErrorMsg.style.display = "none";
    showLoading("Guardando en Google Sheets y subiendo foto a Drive...");
    dom.btnSaveInventory.disabled = true;

    try {
      const payload = {
        pin: state.pin,
        codigoPrincipal: dom.itemCodigoPrincipal.value.trim(),
        codigoAuxiliar: dom.itemCodigoAuxiliar.value.trim(),
        proveedor: dom.itemProveedor.value.trim(),
        cantidad: Number(dom.itemCantidad.value) || 1,
        descripcion: dom.itemDescripcion.value.trim(),
        talla: dom.itemTalla.value.trim(),
        color: dom.itemColor.value.trim(),
        caracteristicas: dom.itemCaracteristicas.value.trim(),
        precioCompra: dom.itemPrecioCompra.value !== "" ? Number(dom.itemPrecioCompra.value) : "",
        precioVenta: dom.itemPrecioVenta.value !== "" ? Number(dom.itemPrecioVenta.value) : "",
        operador: state.operator,
        sucursal: state.branch,
        imageBase64: state.imageBase64
      };

      const res = await fetch("/.netlify/functions/save-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || "No se pudo registrar en Google Sheets.");
      }

      // Guardar URL de exportación a Excel si vino en la respuesta
      if (result.excelExportUrl) {
        state.excelExportUrl = result.excelExportUrl;
      }

      // Mostrar modal de éxito con el código secuencial asignado
      dom.successCodeBadge.textContent = result.codigoPrincipal || "Guardado";
      dom.successRowBadge.textContent = `#${result.sheetRow || "N/A"}`;
      
      if (result.driveFileUrl) {
        dom.successDriveLink.href = result.driveFileUrl;
        dom.driveLinkRow.style.display = "flex";
      } else {
        dom.driveLinkRow.style.display = "none";
      }

      dom.successModal.style.display = "flex";

    } catch (err) {
      console.error("Error al guardar:", err);
      dom.saveErrorMsg.textContent = err.message || "Error al conectar con Google Sheets.";
      dom.saveErrorMsg.style.display = "block";
    } finally {
      hideLoading();
      dom.btnSaveInventory.disabled = false;
    }
  }

  // =========================================================================
  // 8. RESET Y SIGUIENTE PRENDA
  // =========================================================================
  function resetCurrentItem() {
    dom.successModal.style.display = "none";
    resetPhoto();
    discardAudio();
    dom.itemForm.reset();
    dom.voiceTranscriptBox.style.display = "none";
    dom.voiceTranscriptText.textContent = "";
    dom.stepConfirmation.style.display = "none";
    dom.saveErrorMsg.style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // =========================================================================
  // 9. EXPORTAR A EXCEL
  // =========================================================================
  function onExportExcelClick() {
    if (state.excelExportUrl) {
      window.open(state.excelExportUrl, "_blank");
    } else {
      // Fallback a Google Sheets directo o mensaje
      alert("Para descargar el archivo Excel (.xlsx), la hoja debe haber sido creada y configurada en Google Apps Script.");
    }
  }

  // =========================================================================
  // 10. HELPERS DE CARGA
  // =========================================================================
  function showLoading(msg) {
    dom.loadingMessage.textContent = msg || "Procesando...";
    dom.loadingOverlay.style.display = "flex";
  }

  function hideLoading() {
    dom.loadingOverlay.style.display = "none";
  }

  // Arrancar
  document.addEventListener("DOMContentLoaded", init);

})();
