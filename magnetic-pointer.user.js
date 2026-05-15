// ==UserScript==
// @name         Magnetic Pointer - 磁力吸附光标
// @namespace    https://github.com/xiaoguei8888/magnetic-pointer
// @version      1.4.0
// @description  鼠标hover可交互元素时自动框选+磁力吸附；非hover时四角光标自转/缩放呼吸、中心圆点
// @author       xiaoguei8888 (based on JIEJOE's magnetic pointer concept)
// @match        https://*/*
// @match        http://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(() => {
	// ============================================================
	//  默认配置
	// ============================================================
	const DEFAULTS = {
		damping: 0.1,
		paddingRatio: 1 / 50,
		color: "#17f700",
		cornerWidth: 0.2, // rem
		rotateEnabled: true, // 非hover时自转
		rotateSpeed: 10, // 完整一圈的秒数
		pulseEnabled: true, // 非hover时缩放呼吸
		pulseSpeed: 4, // 一次呼吸的秒数
		centerDot: true, // 显示中心圆点
		centerDotSize: 0.4, // rem
		restoreOnIdle: false, // 非hover时恢复原生光标
		hideNativeCursor: true, // 覆盖原生光标（关闭=原生光标与磁力框选叠加显示）
		toggleKey: "Alt+Shift+M",
		settingsKey: "Alt+Shift+,",
		defaultSize: 4, // rem
		cornerSize: 1, // rem
		zIndex: 2147483647,
		cursorExclude: ["video", "video *"],
	};

	// ============================================================
	//  持久化
	// ============================================================
	const STORAGE_KEY = "mag-pointer-settings";

	function loadSettings() {
		try {
			const raw = GM_getValue(STORAGE_KEY);
			if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
		} catch (_) {}
		// 从旧版 localStorage 迁移（v1.2.x 及之前）
		try {
			const old = localStorage.getItem(STORAGE_KEY);
			if (old) {
				const parsed = { ...DEFAULTS, ...JSON.parse(old) };
				GM_setValue(STORAGE_KEY, JSON.stringify(parsed));
				localStorage.removeItem(STORAGE_KEY);
				return parsed;
			}
		} catch (_) {}
		return { ...DEFAULTS };
	}

	function saveSettings() {
		try {
			GM_setValue(STORAGE_KEY, JSON.stringify(state.settings));
		} catch (_) {}
	}

	// ============================================================
	//  运行时状态
	// ============================================================
	const state = {
		enabled: true,
		currentTarget: null,
		mouseX: 0,
		mouseY: 0,
		settings: loadSettings(),
	};

	// ============================================================
	//  CSS 注入
	// ============================================================
	function injectStyles() {
		const s = state.settings;
		const style = document.createElement("style");
		style.id = "mag-pointer-style";
		style.textContent = [
			// ---- 隐藏原生光标 ----
			`html.mag-pointer-active, html.mag-pointer-active * { cursor: none !important; }`,
			...s.cursorExclude.map(
				(sel) => `html.mag-pointer-active ${sel} { cursor: auto !important; }`,
			),
			// ---- 外层：定位 ----
			".mag-pointer-wrap {",
			"  position: fixed; top: 0; left: 0;",
			"  pointer-events: none;",
			`  z-index: ${s.zIndex};`,
			"  opacity: 0;",
			"  transition: transform 0.08s ease-out;",
			"}",
			".mag-pointer-wrap--visible { opacity: 1 !important; }",
			// ---- 内层：视觉 + 自转 ----
			".mag-pointer {",
			`  --width: ${s.defaultSize}rem;`,
			`  --height: ${s.defaultSize}rem;`,
			`  --color: ${s.color};`,
			`  --corner-width: ${s.cornerWidth}rem;`,
			`  --center-size: ${s.centerDotSize}rem;`,
			`  --rotate-speed: ${s.rotateSpeed}s;`,
			`  --pulse-speed: ${s.pulseSpeed}s;`,
			`  --pulse-max: ${s.defaultSize}rem;`,
			`  --pulse-min: ${s.defaultSize / 2}rem;`,
			"  position: absolute;",
			"  top: calc(var(--height) / -2);",
			"  left: calc(var(--width) / -2);",
			"  width: var(--width);",
			"  height: var(--height);",
			"  transition: width 0.2s ease-out, height 0.2s ease-out, top 0.2s ease-out, left 0.2s ease-out;",
			"}",
			".mag-pointer--rotating { animation: mag-spin var(--rotate-speed) linear infinite; }",
			".mag-pointer--pulsing { animation: mag-pulse var(--pulse-speed) ease-in-out infinite; }",
			".mag-pointer--rotating.mag-pointer--pulsing { animation: mag-spin var(--rotate-speed) linear infinite, mag-pulse var(--pulse-speed) ease-in-out infinite; }",
			".mag-pointer--hovering { animation: none !important; }",
			"@keyframes mag-spin { to { rotate: 360deg; } }",
			"@keyframes mag-pulse { 0%, 100% { width: var(--pulse-max); height: var(--pulse-max); top: calc(var(--pulse-max) / -2); left: calc(var(--pulse-max) / -2); } 50% { width: var(--pulse-min); height: var(--pulse-min); top: calc(var(--pulse-min) / -2); left: calc(var(--pulse-min) / -2); } }",
			// ---- 四角 ----
			".mag-pointer__corner {",
			"  position: absolute;",
			`  width: ${s.cornerSize}rem;`,
			`  height: ${s.cornerSize}rem;`,
			"  border-width: var(--corner-width);",
			"  border-color: var(--color);",
			"}",
			".mag-pointer__corner--tl { top:0; left:0;   border-top-style:solid; border-left-style:solid; }",
			".mag-pointer__corner--tr { top:0; right:0;  border-top-style:solid; border-right-style:solid; }",
			".mag-pointer__corner--bl { bottom:0; left:0; border-bottom-style:solid; border-left-style:solid; }",
			".mag-pointer__corner--br { bottom:0; right:0; border-bottom-style:solid; border-right-style:solid; }",
			// ---- 中心圆点（独立元素，始终在鼠标坐标） ----
			".mag-dot {",
			"  position: fixed; top: 0; left: 0;",
			"  --x: 0px; --y: 0px;",
			`  width: ${s.centerDotSize}rem;`,
			`  height: ${s.centerDotSize}rem;`,
			"  border-radius: 50%;",
			`  background: ${s.color};`,
			"  transform: translate(calc(var(--x) - 50%), calc(var(--y) - 50%));",
			"  pointer-events: none;",
			`  z-index: ${s.zIndex};`,
			"  opacity: 0;",
			"}",
			".mag-dot--visible { opacity: 1 !important; }",
			// ---- 设置面板 ----
			".mag-settings-overlay {",
			"  position: fixed; inset: 0;",
			"  background: rgba(0,0,0,0.55);",
			`  z-index: ${s.zIndex - 1};`,
			"  display: flex; align-items: center; justify-content: center;",
			"  font-family: system-ui, -apple-system, sans-serif;",
			"}",
			".mag-settings-overlay, .mag-settings-overlay * { cursor: auto; }",
			".mag-settings-panel {",
			"  background: #1a1a2e;",
			"  border: 1px solid #2a2a4a;",
			"  border-radius: 12px;",
			"  padding: 28px 32px;",
			"  min-width: 360px;",
			"  max-width: 420px;",
			"  color: #e0e0e0;",
			"  font-size: 14px;",
			"  line-height: 1.6;",
			"  box-shadow: 0 8px 40px rgba(0,0,0,0.6);",
			"}",
			".mag-settings-panel h2 {",
			"  display: flex; align-items: center;",
			"  margin: 0 0 20px;",
			"  font-size: 20px;",
			"  font-weight: 600;",
			"  color: #17f700;",
			"  letter-spacing: 0.5px;",
			"  gap: 6px;",
			"}",
			".mag-settings-icon {",
			"  font-size: 26px;",
			"  line-height: 1;",
			"}",
			".mag-settings-row {",
			"  display: flex; align-items: center;",
			"  margin-bottom: 14px;",
			"  gap: 8px;",
			"}",
			".mag-settings-row label { flex-shrink: 0; min-width: 60px; }",
			".mag-settings-row .mag-hint {",
			"  flex: 1;",
			"  font-size: 11px;",
			"  color: #888;",
			"}",
			'.mag-settings-row input[type="color"] {',
			"  width: 32px; height: 26px; border: 1px solid #444; border-radius: 4px;",
			"  background: none; padding: 0; cursor: pointer; flex-shrink: 0;",
			"}",
			".mag-color-reset {",
			"  width: 22px; height: 22px; border: 1px solid #555; border-radius: 50%;",
			"  background: #2a2a3a; color: #aaa; cursor: pointer;",
			"  font-size: 12px; line-height: 1; padding: 0;",
			"  display: flex; align-items: center; justify-content: center;",
			"  flex-shrink: 0; transition: background 0.15s;",
			"}",
			".mag-color-reset:hover { background: #3a3a4a; color: #fff; }",
			'.mag-settings-row input[type="range"] {',
			"  flex: 1; accent-color: #17f700;",
			"}",
			'.mag-settings-row input[type="checkbox"] {',
			"  accent-color: #17f700; width: 16px; height: 16px; flex-shrink: 0; margin-left: auto;",
			"}",
			".mag-settings-row .mag-val {",
			"  font-size: 12px; color: #999; min-width: 50px; text-align: right;",
			"}",
			".mag-settings-btns {",
			"  display: flex; gap: 10px; margin-top: 22px; justify-content: flex-end;",
			"}",
			".mag-settings-btns button {",
			"  padding: 6px 20px; border-radius: 6px; border: 1px solid #444;",
			"  background: #2a2a3a; color: #ddd; cursor: pointer; font-size: 13px;",
			"  transition: background 0.15s;",
			"}",
			".mag-settings-btns button:hover { background: #3a3a4a; }",
			".mag-settings-btns button.mag-primary {",
			"  background: #17f700; color: #111; border-color: #17f700; font-weight: 600;",
			"}",
			".mag-settings-btns button.mag-primary:hover { background: #33ff1a; }",
			// ---- 左上角标 ----
			".mag-badge {",
			"  position: fixed; top: 10px; left: 10px;",
			"  width: 28px; height: 28px;",
			"  border-radius: 6px;",
			"  background: rgba(23,247,0,0.12);",
			"  border: 1px solid rgba(23,247,0,0.25);",
			`  z-index: ${s.zIndex - 2};`,
			"  cursor: pointer !important;",
			"  display: flex; align-items: center; justify-content: center;",
			"  font-size: 14px; line-height: 1;",
			"  color: rgba(23,247,0,0.5);",
			"  transition: background 0.2s, color 0.2s;",
			"  user-select: none;",
			"}",
			".mag-badge:hover {",
			"  background: rgba(23,247,0,0.3);",
			"  color: rgba(23,247,0,0.8);",
			"}",
		].join("\n");
		document.head.appendChild(style);
	}

	// ============================================================
	//  DOM 创建
	// ============================================================
	function createPointer() {
		// 外层：定位
		const wrap = document.createElement("div");
		wrap.className = "mag-pointer-wrap";
		// 内层：视觉
		const ptr = document.createElement("div");
		ptr.className = "mag-pointer mag-pointer--rotating mag-pointer--pulsing";
		for (const pos of ["tl", "tr", "bl", "br"]) {
			const corner = document.createElement("div");
			corner.className = `mag-pointer__corner mag-pointer__corner--${pos}`;
			ptr.appendChild(corner);
		}
		wrap.appendChild(ptr);
		document.body.appendChild(wrap);
		return { wrap, ptr };
	}

	function createDot() {
		const el = document.createElement("div");
		el.className = "mag-dot";
		document.body.appendChild(el);
		return el;
	}

	function createBadge() {
		const badge = document.createElement("div");
		badge.className = "mag-badge";
		badge.title = "Magnetic Pointer 设置";
		badge.textContent = "\u26a1";
		badge.addEventListener("click", (e) => {
			e.stopPropagation();
			showSettings();
		});
		document.body.appendChild(badge);
		return badge;
	}

	// ============================================================
	//  设置面板
	// ============================================================
	let settingsOverlay = null;

	function createSettingsPanel() {
		const s = state.settings;

		const overlay = document.createElement("div");
		overlay.className = "mag-settings-overlay";
		overlay.style.display = "none";

		const panel = document.createElement("div");
		panel.className = "mag-settings-panel";

		const h2 = document.createElement("h2");
		const icon = document.createElement("span");
		icon.className = "mag-settings-icon";
		icon.textContent = "\u2699";
		h2.appendChild(icon);
		h2.appendChild(document.createTextNode("Magnetic Pointer"));
		panel.appendChild(h2);

		const row = () => {
			const r = document.createElement("div");
			r.className = "mag-settings-row";
			panel.appendChild(r);
			return r;
		};

		// 颜色
		const rowColor = row();
		const lblColor = mkLabel("\u5149\u6807\u989c\u8272");
		rowColor.appendChild(lblColor);
		const btnResetColor = document.createElement("button");
		btnResetColor.className = "mag-color-reset";
		btnResetColor.style.marginLeft = "auto";
		btnResetColor.title = "\u6062\u590d\u9ed8\u8ba4\u989c\u8272";
		btnResetColor.textContent = "\u21ba";
		btnResetColor.addEventListener("click", () => {
			inpColor.value = DEFAULTS.color;
		});
		rowColor.appendChild(btnResetColor);
		const inpColor = mkInput("mag-set-color", "color");
		inpColor.value = s.color;
		rowColor.appendChild(inpColor);

		// 粗细
		const rowWidth = row();
		rowWidth.appendChild(mkLabel("\u89d2\u6807\u7c97\u7ec6"));
		const inpWidth = mkInput("mag-set-width", "range");
		inpWidth.min = "0.1";
		inpWidth.max = "0.8";
		inpWidth.step = "0.05";
		inpWidth.value = String(s.cornerWidth);
		rowWidth.appendChild(inpWidth);
		const valWidth = document.createElement("span");
		valWidth.className = "mag-val";
		valWidth.id = "mag-set-width-val";
		valWidth.textContent = s.cornerWidth.toFixed(2) + " rem";
		rowWidth.appendChild(valWidth);
		inpWidth.addEventListener("input", () => {
			valWidth.textContent = parseFloat(inpWidth.value).toFixed(2) + " rem";
		});

		// 中心圆点
		const rowDot = row();
		rowDot.appendChild(mkLabel("\u4e2d\u5fc3\u5706\u70b9"));
		const hintDot = document.createElement("span");
		hintDot.className = "mag-hint";
		hintDot.textContent =
			"\u5728\u9f20\u6807\u4f4d\u7f6e\u663e\u793a\u6307\u793a\u5706\u70b9";
		rowDot.appendChild(hintDot);
		const inpDot = mkCheckbox("mag-set-dot", s.centerDot);
		rowDot.appendChild(inpDot);

		// 旋转
		const rowRot = row();
		rowRot.appendChild(mkLabel("\u6162\u901f\u81ea\u8f6c"));
		const hintRot = document.createElement("span");
		hintRot.className = "mag-hint";
		hintRot.textContent =
			"\u975e hover \u65f6\u6846\u9009\u6846\u7f13\u6162\u65cb\u8f6c";
		rowRot.appendChild(hintRot);
		const inpRot = mkCheckbox("mag-set-rotate", s.rotateEnabled);
		rowRot.appendChild(inpRot);

		// 缩放呼吸
		const rowPulse = row();
		rowPulse.appendChild(mkLabel("\u7f29\u653e\u547c\u5438"));
		const hintPulse = document.createElement("span");
		hintPulse.className = "mag-hint";
		hintPulse.textContent =
			"\u975e hover \u65f6\u6846\u9009\u6846\u5ffd\u5927\u5ffd\u5c0f";
		rowPulse.appendChild(hintPulse);
		const inpPulse = mkCheckbox("mag-set-pulse", s.pulseEnabled);
		rowPulse.appendChild(inpPulse);

		// 覆盖原生光标
		const rowHide = row();
		rowHide.appendChild(mkLabel("\u8986\u76d6\u5149\u6807"));
		const hintHide = document.createElement("span");
		hintHide.className = "mag-hint";
		hintHide.textContent =
			"\u9690\u85cf\u539f\u751f\u5149\u6807\uff0c\u7528\u78c1\u529b\u6548\u679c\u66ff\u4ee3";
		rowHide.appendChild(hintHide);
		const inpHide = mkCheckbox("mag-set-hide-cursor", s.hideNativeCursor);
		rowHide.appendChild(inpHide);

		// 空闲恢复（需要覆盖光标开启才生效）
		const rowRest = row();
		rowRest.appendChild(mkLabel("\u7a7a\u95f2\u6062\u590d"));
		const hintRest = document.createElement("span");
		hintRest.className = "mag-hint";
		hintRest.textContent =
			"\u975e hover \u65f6\u6062\u590d\u539f\u751f\u5149\u6807\uff08\u4ec5\u300c\u8986\u76d6\u5149\u6807\u300d\u5f00\u542f\u65f6\u751f\u6548\uff09";
		rowRest.appendChild(hintRest);
		const inpRest = mkCheckbox("mag-set-restore", s.restoreOnIdle);
		rowRest.appendChild(inpRest);

		// 按钮
		const btns = document.createElement("div");
		btns.className = "mag-settings-btns";
		const btnClose = mkButton("mag-set-close", "\u5173\u95ed");
		btns.appendChild(btnClose);
		const btnSave = mkButton("mag-set-save", "\u4fdd\u5b58", true);
		btns.appendChild(btnSave);
		panel.appendChild(btns);

		overlay.appendChild(panel);
		document.body.appendChild(overlay);

		btnClose.addEventListener("click", hideSettings);
		overlay.addEventListener("click", (e) => {
			if (e.target === overlay) hideSettings();
		});

		btnSave.addEventListener("click", () => {
			state.settings.color = inpColor.value;
			state.settings.cornerWidth = parseFloat(inpWidth.value);
			state.settings.centerDot = inpDot.checked;
			state.settings.rotateEnabled = inpRot.checked;
			state.settings.pulseEnabled = inpPulse.checked;
			state.settings.restoreOnIdle = inpRest.checked;
			state.settings.hideNativeCursor = inpHide.checked;
			saveSettings();
			applySettings();
			hideSettings();
		});

		return overlay;
	}

	function showSettings() {
		if (!settingsOverlay) settingsOverlay = createSettingsPanel();
		const s = state.settings;
		const $ = (id) => settingsOverlay.querySelector("#" + id);
		$("mag-set-color").value = s.color;
		$("mag-set-width").value = s.cornerWidth;
		$("mag-set-width-val").textContent = s.cornerWidth.toFixed(2) + " rem";
		$("mag-set-dot").checked = s.centerDot;
		$("mag-set-rotate").checked = s.rotateEnabled;
		$("mag-set-pulse").checked = s.pulseEnabled;
		$("mag-set-restore").checked = s.restoreOnIdle;
		$("mag-set-hide-cursor").checked = s.hideNativeCursor;
		settingsOverlay.style.display = "flex";
	}

	function hideSettings() {
		if (settingsOverlay) settingsOverlay.style.display = "none";
	}

	// ---- 辅助 ----
	function mkLabel(text) {
		const el = document.createElement("label");
		el.textContent = text;
		return el;
	}
	function mkInput(id, type) {
		const el = document.createElement("input");
		el.type = type;
		el.id = id;
		return el;
	}
	function mkCheckbox(id, checked) {
		const el = document.createElement("input");
		el.type = "checkbox";
		el.id = id;
		if (checked) el.checked = true;
		return el;
	}
	function mkButton(id, text, primary) {
		const el = document.createElement("button");
		el.id = id;
		el.textContent = text;
		if (primary) el.className = "mag-primary";
		return el;
	}

	// ============================================================
	//  原生光标控制
	// ============================================================
	function setNativeCursor(hidden) {
		if (state.settings.hideNativeCursor && hidden) {
			document.documentElement.classList.add("mag-pointer-active");
		} else {
			document.documentElement.classList.remove("mag-pointer-active");
		}
	}

	// ============================================================
	//  应用设置（更新 CSS 变量和 DOM 状态）
	// ============================================================
	function applySettings() {
		const s = state.settings;

		pointerEl.ptr.style.setProperty("--color", s.color);
		pointerEl.ptr.style.setProperty("--corner-width", s.cornerWidth + "rem");
		pointerEl.ptr.style.setProperty("--rotate-speed", s.rotateSpeed + "s");
		pointerEl.ptr.style.setProperty("--pulse-speed", s.pulseSpeed + "s");
		pointerEl.ptr.style.setProperty("--pulse-max", s.defaultSize + "rem");
		pointerEl.ptr.style.setProperty("--pulse-min", s.defaultSize / 2 + "rem");

		// 中心圆点
		dotEl.style.width = s.centerDotSize + "rem";
		dotEl.style.height = s.centerDotSize + "rem";
		dotEl.style.background = s.color;
		dotEl.style.display = s.centerDot ? "" : "none";

		// 自转
		pointerEl.ptr.classList.toggle("mag-pointer--rotating", s.rotateEnabled);
		// 缩放呼吸
		pointerEl.ptr.classList.toggle("mag-pointer--pulsing", s.pulseEnabled);

		// 角标颜色同步
		badgeEl.style.color = s.color + "80";
		badgeEl.style.background = s.color + "1F";
		badgeEl.style.borderColor = s.color + "40";

		// 原生光标
		if (s.hideNativeCursor) {
			if (s.restoreOnIdle) {
				setNativeCursor(!!state.currentTarget);
			} else {
				setNativeCursor(state.enabled);
			}
		} else {
			setNativeCursor(false);
		}
	}

	// ============================================================
	//  元素检测
	// ============================================================
	function isNativeInteractive(el) {
		const tag = el.tagName;
		if (
			tag === "A" ||
			tag === "BUTTON" ||
			tag === "SELECT" ||
			tag === "TEXTAREA" ||
			tag === "SUMMARY"
		)
			return true;
		if (tag === "INPUT") {
			const t = el.type;
			return (
				t === "submit" ||
				t === "button" ||
				t === "reset" ||
				t === "image" ||
				t === "checkbox" ||
				t === "radio"
			);
		}
		if (el.hasAttribute("onclick")) return true;
		const role = el.getAttribute("role");
		if (
			role === "button" ||
			role === "link" ||
			role === "menuitem" ||
			role === "tab"
		)
			return true;
		if (el.hasAttribute("href") || el.hasAttribute("data-href")) return true;
		return false;
	}

	const INLINE_TEXT_TAGS = new Set([
		"SPAN",
		"EM",
		"STRONG",
		"I",
		"B",
		"CODE",
		"SMALL",
		"MARK",
		"SUB",
		"SUP",
		"U",
		"S",
		"ABBR",
		"CITE",
		"DFN",
		"KBD",
		"Q",
		"SAMP",
		"TIME",
		"VAR",
	]);

	function isInlineText(el) {
		return (
			INLINE_TEXT_TAGS.has(el.tagName) &&
			getComputedStyle(el).display.startsWith("inline")
		);
	}

	const PLAYER_SELECTORS = ["video"];

	function isInPlayer(el) {
		for (const sel of PLAYER_SELECTORS) {
			try {
				if (el.matches(sel) || el.closest(sel)) return true;
			} catch (_) {}
		}
		return false;
	}

	/** 跳过脚本自身的元素 */
	function isOwnElement(el) {
		while (el) {
			if (
				el.classList?.contains("mag-badge") ||
				el.classList?.contains("mag-settings-overlay")
			)
				return true;
			el = el.parentElement;
		}
		return false;
	}

	function findInteractiveAncestor(start) {
		if (isOwnElement(start)) return null;
		let el = start;
		let pointerCandidate = null;
		while (el && el !== document.body && el !== document.documentElement) {
			if (isInPlayer(el)) return null;
			if (isNativeInteractive(el)) return el;
			if (isInlineText(el)) {
				el = el.parentElement;
				continue;
			}
			if (!pointerCandidate) {
				try {
					if (getComputedStyle(el).cursor === "pointer") pointerCandidate = el;
				} catch (_) {}
			}
			el = el.parentElement;
		}
		return pointerCandidate;
	}

	// ============================================================
	//  指针操作
	// ============================================================
	const pointerEl = createPointer();
	const dotEl = createDot();
	const badgeEl = createBadge();
	let visible = false;

	function showPointer() {
		if (!visible) {
			visible = true;
			pointerEl.wrap.classList.add("mag-pointer-wrap--visible");
			dotEl.classList.add("mag-dot--visible");
		}
	}

	function hidePointer() {
		if (visible) {
			visible = false;
			pointerEl.wrap.classList.remove("mag-pointer-wrap--visible");
			dotEl.classList.remove("mag-dot--visible");
		}
	}

	function setPosition(x, y) {
		pointerEl.wrap.style.transform = `translate(${x}px, ${y}px)`;
	}

	function attachToElement(el) {
		cancelLeave();
		state.currentTarget = el;
		pointerEl.ptr.classList.add("mag-pointer--hovering");
		if (state.settings.restoreOnIdle) {
			setNativeCursor(true);
		}
		const rect = el.getBoundingClientRect();
		const pad = window.innerWidth * state.settings.paddingRatio;
		pointerEl.ptr.style.setProperty("--width", rect.width + pad + "px");
		pointerEl.ptr.style.setProperty("--height", rect.height + pad + "px");
	}

	function detachFromElement() {
		state.currentTarget = null;
		pointerEl.ptr.classList.remove("mag-pointer--hovering");
		pointerEl.ptr.style.setProperty(
			"--width",
			state.settings.defaultSize + "rem",
		);
		pointerEl.ptr.style.setProperty(
			"--height",
			state.settings.defaultSize + "rem",
		);
		setPosition(state.mouseX, state.mouseY);
		if (state.settings.restoreOnIdle) {
			setNativeCursor(false);
			hidePointer();
		}
	}

	// ============================================================
	//  离开延迟（防止边缘抖动）
	// ============================================================
	const LEAVE_DELAY_MS = 120;
	let leaveTimer = null;

	function scheduleLeave() {
		if (leaveTimer || !state.currentTarget) return;
		leaveTimer = setTimeout(() => {
			leaveTimer = null;
			if (!state.currentTarget) return;
			// 延迟结束后再次验证鼠标确实在外部
			const rect = state.currentTarget.getBoundingClientRect();
			const pad = window.innerWidth * state.settings.paddingRatio * 0.5;
			if (
				state.mouseX < rect.left - pad ||
				state.mouseX > rect.right + pad ||
				state.mouseY < rect.top - pad ||
				state.mouseY > rect.bottom + pad
			) {
				detachFromElement();
			}
		}, LEAVE_DELAY_MS);
	}

	function cancelLeave() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = null;
		}
	}

	// ============================================================
	//  事件处理
	// ============================================================
	function handleMouseMove(e) {
		if (!state.enabled) return;
		state.mouseX = e.clientX;
		state.mouseY = e.clientY;

		if (!state.settings.restoreOnIdle || state.currentTarget) {
			showPointer();
		}

		let x = e.clientX;
		let y = e.clientY;

		if (state.currentTarget) {
			const rect = state.currentTarget.getBoundingClientRect();
			const pad = window.innerWidth * state.settings.paddingRatio * 0.5;
			if (
				e.clientX < rect.left - pad ||
				e.clientX > rect.right + pad ||
				e.clientY < rect.top - pad ||
				e.clientY > rect.bottom + pad
			) {
				scheduleLeave();
			} else {
				const cx = rect.left + rect.width / 2;
				const cy = rect.top + rect.height / 2;
				x = cx + (e.clientX - cx) * state.settings.damping;
				y = cy + (e.clientY - cy) * state.settings.damping;
			}
		}

		setPosition(x, y);
		updateCenterDot(e.clientX, e.clientY);
	}

	function updateCenterDot(mx, my) {
		// 圆点独立于框选，直接定位到鼠标坐标，无重排、无亚像素波动
		dotEl.style.setProperty("--x", mx + "px");
		dotEl.style.setProperty("--y", my + "px");
	}

	function handleMouseOver(e) {
		if (!state.enabled) return;
		const target = findInteractiveAncestor(e.target);
		if (target && target !== state.currentTarget) {
			attachToElement(target);
		} else if (!target && state.currentTarget) {
			scheduleLeave();
		}
	}

	function handleScroll() {
		if (!state.currentTarget) return;
		const rect = state.currentTarget.getBoundingClientRect();
		const pad = window.innerWidth * state.settings.paddingRatio * 0.5;
		if (
			state.mouseX < rect.left - pad ||
			state.mouseX > rect.right + pad ||
			state.mouseY < rect.top - pad ||
			state.mouseY > rect.bottom + pad
		) {
			scheduleLeave();
		} else {
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const sx = cx + (state.mouseX - cx) * state.settings.damping;
			const sy = cy + (state.mouseY - cy) * state.settings.damping;
			setPosition(sx, sy);
			updateCenterDot(state.mouseX, state.mouseY);
		}
	}

	// ---- 快捷键 ----
	const CODE_MAP = {
		",": "Comma",
		".": "Period",
		";": "Semicolon",
		"/": "Slash",
		"\\": "Backslash",
		"[": "BracketLeft",
		"]": "BracketRight",
		"-": "Minus",
		"=": "Equal",
		"`": "Backquote",
		ArrowUp: "ArrowUp",
		ArrowDown: "ArrowDown",
		ArrowLeft: "ArrowLeft",
		ArrowRight: "ArrowRight",
	};

	function matchShortcut(e, shortcut) {
		if (!shortcut) return false;
		const parts = shortcut.split("+").map((p) => p.trim());
		const needsAlt = parts.includes("Alt");
		const needsShift = parts.includes("Shift");
		const needsCtrl = parts.includes("Ctrl") || parts.includes("Control");
		const needsMeta = parts.includes("Meta") || parts.includes("Cmd");
		const key = parts.find(
			(p) => !["Alt", "Shift", "Ctrl", "Control", "Meta", "Cmd"].includes(p),
		);
		if (!key) return false;
		const expectedCode = CODE_MAP[key] || `Key${key.toUpperCase()}`;
		return (
			e.altKey === needsAlt &&
			e.shiftKey === needsShift &&
			e.ctrlKey === needsCtrl &&
			e.metaKey === needsMeta &&
			e.code === expectedCode
		);
	}

	function handleKeyDown(e) {
		// 开关
		if (matchShortcut(e, state.settings.toggleKey)) {
			e.preventDefault();
			toggle();
			return;
		}
		// 设置面板
		if (matchShortcut(e, state.settings.settingsKey)) {
			e.preventDefault();
			showSettings();
		}
	}

	// ============================================================
	//  开关
	// ============================================================
	function enable() {
		state.enabled = true;
		badgeEl.style.opacity = "1";
		if (!state.settings.restoreOnIdle) {
			setNativeCursor(true);
		}
	}

	function disable() {
		state.enabled = false;
		detachFromElement();
		hidePointer();
		badgeEl.style.opacity = "0";
		setNativeCursor(false);
	}

	function toggle() {
		state.enabled ? disable() : enable();
	}

	// ============================================================
	//  启动
	// ============================================================
	function init() {
		injectStyles();
		applySettings();
		enable();

		document.addEventListener("mousemove", handleMouseMove, { passive: true });
		document.addEventListener("mouseover", handleMouseOver, { passive: true });
		window.addEventListener("scroll", handleScroll, { passive: true });
		document.addEventListener("keydown", handleKeyDown);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
