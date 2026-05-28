// ============================================================
// STYLES
// ============================================================

const gold = "#c9a961";
const goldDim = "rgba(201,169,97,0.3)";
const green = "#8aad8a";
const greenDim = "#5a7a5a";
const bg = "#0d1f17";
const bgLight = "#1a3a2a";
const felt = "linear-gradient(160deg, #1a3a2a 0%, #0d1f17 40%, #142e20 100%)";

function calcScale(vw, vh) {
  const baseW = 1200, baseH = 800;
  return Math.min(Math.max(Math.min(vw / baseW, vh / baseH), 0.45), 1.4);
}

// Shrinks discard-pool tiles as a player's pile grows so they all stay
// visible without scrolling. Returns null below the threshold.
function computeDiscardOverride(maxCount, vw, vh) {
  const lo = 6, hi = 22;
  if (maxCount <= lo) return null;
  const scale = calcScale(vw, vh);
  const t = Math.min(1, (maxCount - lo) / (hi - lo));
  const fs = Math.round((42 - t * 18) * scale);
  return { fontSize: fs };
}

function makeStyles(vw, vh) {
  const scale = calcScale(vw, vh);
  const s = (v) => Math.round(v * scale);
  // Dampened scale for text (don't shrink below 0.7x)
  const ts = (v) => Math.round(v * Math.max(scale, 0.7));
  // Small/compact: for tiny screen, shrink more aggressively
  const isCompact = vw < 700 || vh < 550;
  // When the screen is shorter than the menu naturally needs and wide enough
  // for two columns, lay the menu out side-by-side so the rules panel moves
  // out of the vertical stack.
  const menuTwoCol = vh < 720 && vw >= 760;

  // Shared tile appearance — single source of truth
  const tileBase = {
    display: "inline-block",
    verticalAlign: "middle",
  };

  return {
  // ---- MENU ----
  menuContainer: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: felt, fontFamily: "'Georgia', serif", padding: s(12),
    overflowY: "auto",
    userSelect: "none", WebkitUserSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },
  menuCard: {
    background: "rgba(26,58,42,0.92)", border: `2px solid ${gold}`, borderRadius: s(14),
    padding: menuTwoCol ? `${s(24)}px ${s(28)}px` : `${s(28)}px ${s(32)}px`,
    maxWidth: menuTwoCol ? s(800) : s(420), width: "100%",
    boxShadow: "0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(201,169,97,0.15)",
    display: "flex",
    flexDirection: menuTwoCol ? "row" : "column",
    gap: menuTwoCol ? s(28) : 0,
    alignItems: "stretch",
  },
  menuMain: {
    flex: 1, textAlign: "center",
    display: "flex", flexDirection: "column", justifyContent: "center",
    minWidth: 0,
  },
  menuAside: {
    flex: menuTwoCol ? "0 0 260px" : "0 0 auto",
    display: "flex", alignItems: "stretch",
    marginTop: menuTwoCol ? 0 : s(18),
  },
  menuTitle: { fontSize: s(44), color: gold, margin: 0, letterSpacing: s(5), textShadow: "0 3px 12px rgba(0,0,0,0.6)" },
  menuSubtitle: { color: green, fontSize: ts(12), marginTop: s(6), marginBottom: s(20), letterSpacing: s(3), textTransform: "uppercase" },
  menuSetting: { marginBottom: s(16) },
  menuLabel: { color: gold, display: "block", marginBottom: s(8), fontSize: ts(13), letterSpacing: 1 },
  // Grid keeps the three buttons equal-width inside their row regardless of
  // label length, so EN vs ZH labels don't reflow the menu.
  windButtons: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: s(8) },
  windBtn: {
    background: "rgba(201,169,97,0.08)", border: `1px solid ${goldDim}`, color: green,
    padding: `${s(8)}px ${s(10)}px`, borderRadius: s(6), cursor: "pointer", outline: "none", fontSize: ts(13), transition: "all 0.2s",
    whiteSpace: "nowrap",
  },
  windBtnActive: { background: "rgba(201,169,97,0.22)", borderColor: gold, color: gold },
  startBtn: {
    background: `linear-gradient(135deg, ${gold}, #a8873d)`, color: bg, border: "none",
    padding: `${s(12)}px ${s(36)}px`, borderRadius: s(8), fontSize: ts(17), fontWeight: "bold", cursor: "pointer", outline: "none", letterSpacing: 1,
    minWidth: s(180), whiteSpace: "nowrap",
  },
  langBtn: {
    background: "rgba(201,169,97,0.1)", border: `1px solid ${goldDim}`, color: gold,
    padding: `${s(6)}px ${s(14)}px`, borderRadius: s(6), cursor: "pointer", outline: "none", fontSize: ts(13), fontWeight: "bold", letterSpacing: 1,
    minWidth: s(130), whiteSpace: "nowrap",
  },
  menuBtnRow: { display: "flex", gap: s(10), justifyContent: "center", alignItems: "center", flexWrap: "wrap", marginTop: s(6) },
  menuHelpRow: { display: "flex", justifyContent: "center", marginTop: s(8) },
  rulesBox: {
    flex: 1, padding: `${s(12)}px ${s(16)}px`, background: "rgba(0,0,0,0.25)", borderRadius: s(8),
    border: "1px solid rgba(201,169,97,0.12)", textAlign: "left",
  },
  rulesTitle: { color: gold, margin: `0 0 ${s(8)}px 0`, fontSize: ts(13), letterSpacing: 1 },
  ruleText: { color: green, margin: `${s(4)}px 0`, fontSize: ts(12), lineHeight: 1.5 },

  // ---- GAME SHELL ----
  gameContainer: {
    height: "100vh", display: "flex", flexDirection: "column",
    background: felt, fontFamily: "'Georgia', serif", color: "#d4c9a8", overflow: "hidden",
  },

  // ---- TOP BAR ----
  topBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: `${s(6)}px ${s(16)}px`, borderBottom: `1px solid rgba(201,169,97,0.15)`,
    background: "rgba(0,0,0,0.3)", flexShrink: 0, flexWrap: "wrap", gap: s(6),
  },
  topBarLeft: { display: "flex", gap: s(12), alignItems: "center", flexWrap: "wrap" },
  topBarRight: { display: "flex", gap: s(10), alignItems: "center", flexWrap: "wrap" },
  roundInfo: { color: gold, fontSize: ts(13), letterSpacing: 1, fontWeight: "bold" },
  wallCount: { color: green, fontSize: ts(12) },
  scoreChip: {
    color: gold, fontSize: ts(11), fontWeight: "bold", letterSpacing: 0.5,
    background: "rgba(201,169,97,0.12)", border: `1px solid rgba(201,169,97,0.3)`,
    padding: `${s(2)}px ${s(8)}px`, borderRadius: s(10), whiteSpace: "nowrap",
  },
  scoreChipBroke: {
    color: "#f0a0a0",
    background: "rgba(200,80,80,0.18)", border: `1px solid rgba(220,120,120,0.55)`,
  },
  statusText: { color: greenDim, fontSize: ts(12), fontStyle: "italic" },
  statusTextYou: { color: gold, fontSize: ts(12), fontWeight: "bold" },
  menuBtn: {
    background: "none", border: `1px solid ${goldDim}`, color: gold,
    padding: `${s(3)}px ${s(10)}px`, borderRadius: s(4), cursor: "pointer", outline: "none", fontSize: ts(14),
  },

  // ---- TABLE LAYOUT ----
  tableArea: {
    flex: 1, display: "flex", flexDirection: "row",
    overflow: "hidden", minHeight: 0,
    padding: `${s(4)}px ${s(8)}px`, gap: s(8),
  },
  gameArea: {
    flex: 1, display: "flex", flexDirection: "column",
    overflow: "hidden", minHeight: 0, gap: s(4),
  },
  topOppRow: {
    flexShrink: 0, display: "flex", alignItems: "center",
    justifyContent: "center", gap: s(8), padding: `${s(2)}px 0`,
  },
  midRow: {
    flex: 1, display: "flex", flexDirection: "row",
    overflow: "hidden", minHeight: 0, gap: s(8),
    alignItems: "center", justifyContent: "center",
  },
  sideOpp: {
    flex: `0 0 ${s(140)}px`, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: s(6),
  },
  turnArrow: {
    color: goldDim, fontSize: ts(16), userSelect: "none",
  },
  turnOrderLabel: {
    flexShrink: 0, textAlign: "center", color: greenDim,
    fontSize: ts(10), padding: `${s(1)}px 0`, letterSpacing: 1,
    userSelect: "none",
  },
  logPanel: {
    flex: `0 0 ${s(180)}px`, overflowY: "auto", padding: `${s(8)}px ${s(10)}px`,
    background: "rgba(0,0,0,0.2)", borderRadius: s(8),
    border: `1px solid rgba(201,169,97,0.1)`, alignSelf: "stretch",
  },

  // Discard pool (center of midRow, grows to fill)
  discardPoolScroll: {
    flex: "1 1 auto", overflowY: "auto", minWidth: 0,
  },

  // Opponent strip
  oppStrip: {
    padding: `${s(5)}px ${s(10)}px`, borderRadius: s(6), border: `1px solid rgba(201,169,97,0.08)`,
    background: "rgba(0,0,0,0.3)", transition: "all 0.3s",
    width: "100%", maxWidth: s(260),
  },
  oppStripActive: {
    background: "rgba(201,169,97,0.08)", borderColor: "rgba(201,169,97,0.25)",
    boxShadow: "0 0 12px rgba(201,169,97,0.1)",
  },
  oppHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s(3) },
  oppName: { color: green, fontSize: ts(10), letterSpacing: 1, textTransform: "uppercase", fontWeight: "bold" },
  oppNameActive: { color: gold },
  turnIndicator: { color: gold, fontSize: ts(9) },
  oppTileCount: { color: greenDim, fontSize: ts(10) },
  personalityTag: {
    fontSize: ts(8), color: "#8a7a5a", letterSpacing: 0.5,
    background: "rgba(201,169,97,0.08)", borderRadius: s(3),
    padding: `1px ${s(4)}px`, alignSelf: "flex-start",
  },
  positionLabel: {
    fontSize: ts(8), color: greenDim, letterSpacing: 0.5,
    fontStyle: "italic",
  },
  oppMeldsRow: { display: "flex", gap: s(3), flexWrap: "wrap", marginTop: s(3) },
  oppMeldGroup: {
    display: "flex", gap: 1, background: "transparent", padding: `${s(2)}px ${s(3)}px`,
    borderRadius: s(3), border: "none",
  },
  oppMeldTile: { ...tileBase, fontSize: s(32), lineHeight: 1 },
  concealedTile: { opacity: 0.5, background: "rgba(60,80,60,0.7)" },

  // Discard pool
  discardPoolContainer: {
    width: "100%", maxWidth: s(600), margin: "0 auto", background: "rgba(0,0,0,0.2)",
    border: `1px solid rgba(201,169,97,0.12)`, borderRadius: s(10), padding: `${s(12)}px ${s(16)}px`,
  },
  discardPoolHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: s(8), flexWrap: "wrap", gap: s(6),
  },
  discardPoolTitle: { color: gold, fontSize: ts(12), letterSpacing: 2, textTransform: "uppercase", fontWeight: "bold" },
  lastDiscardBadge: {
    color: "#d4c9a8", fontSize: ts(12), background: "rgba(201,169,97,0.12)",
    padding: `${s(4)}px ${s(10)}px`, borderRadius: s(16), border: `1px solid rgba(201,169,97,0.2)`,
  },
  lastDiscardEmoji: { ...tileBase, fontSize: s(24), lineHeight: 1, verticalAlign: "middle" },
  lastDiscardFrom: { color: greenDim, fontSize: ts(10) },
  discardTableLayout: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "auto auto auto",
    gap: s(6),
  },
  discardPositionTop: {
    gridColumn: "1 / -1", justifySelf: "center", width: "50%",
    background: "transparent", borderRadius: s(6), padding: `${s(5)}px ${s(8)}px`,
    border: "none", minHeight: s(40), textAlign: "center",
  },
  discardPositionBottom: {
    gridColumn: "1 / -1", justifySelf: "center", width: "50%",
    background: "transparent", borderRadius: s(6), padding: `${s(5)}px ${s(8)}px`,
    border: "none", minHeight: s(40), textAlign: "center",
  },
  discardPositionSide: {
    background: "transparent", borderRadius: s(6), padding: `${s(5)}px ${s(8)}px`,
    border: "none", minHeight: s(40),
  },
  discardPlayerLabel: {
    color: greenDim, fontSize: ts(10), textTransform: "uppercase", letterSpacing: 1,
    marginBottom: s(4), fontWeight: "bold", textAlign: "center",
  },
  discardTilesWrap: { display: "flex", flexWrap: "wrap", gap: s(3), justifyContent: "center" },
  discardEmpty: { color: "rgba(201,169,97,0.15)", fontSize: ts(12) },
  discardTile: {
    ...tileBase, fontSize: s(42), lineHeight: 1,
    cursor: "default", transition: "all 0.15s",
  },
  discardTileLatest: {
    filter: "brightness(1.1) saturate(1.15)",
    textShadow: `0 0 ${s(10)}px rgba(201,169,97,0.9)`,
  },

  logEntry: { color: greenDim, fontSize: ts(10), padding: `${s(2)}px 0`, fontFamily: "monospace", lineHeight: 1.5 },

  // ---- PLAYER SECTION ----
  playerSection: {
    flexShrink: 0, borderTop: `2px solid rgba(201,169,97,0.2)`,
    background: "linear-gradient(to top, rgba(0,0,0,0.3), rgba(0,0,0,0.1))",
    padding: `${s(6)}px ${s(16)}px ${s(10)}px`, overflow: "hidden", position: "relative",
  },
  playerScoreRow: { display: "flex", justifyContent: "flex-end", marginBottom: s(4) },

  // Action bar
  actionBar: {
    display: "flex", gap: s(8), justifyContent: "center", alignItems: "center",
    marginBottom: s(6), minHeight: s(36), flexWrap: "wrap",
  },
  actionBtn: {
    background: "rgba(201,169,97,0.12)", border: `1px solid rgba(201,169,97,0.35)`,
    color: gold, padding: `${s(7)}px ${s(18)}px`, borderRadius: s(6), cursor: "pointer", outline: "none",
    fontSize: ts(14), fontWeight: "bold", letterSpacing: 0.5, transition: "all 0.15s",
    minHeight: s(38), touchAction: "manipulation",
  },
  actionBtnDanger: {
    background: "rgba(180,80,80,0.2)", border: "1px solid rgba(200,100,100,0.35)",
    color: "#d4a0a0", padding: `${s(7)}px ${s(18)}px`, borderRadius: s(6), cursor: "pointer", outline: "none", fontSize: ts(14),
    minHeight: s(38), touchAction: "manipulation",
  },
  actionBtnWin: {
    background: `linear-gradient(135deg, ${gold}, #a8873d)`, border: "none", color: bg,
    padding: `${s(9)}px ${s(24)}px`, borderRadius: s(6), cursor: "pointer", outline: "none", fontSize: ts(16), fontWeight: "bold",
    letterSpacing: 1, boxShadow: `0 0 ${s(24)}px rgba(201,169,97,0.35)`,
    minHeight: s(38), touchAction: "manipulation",
  },

  // Player melds
  playerMeldsRow: { display: "flex", gap: s(8), justifyContent: "center", marginBottom: s(6), flexWrap: "wrap" },
  playerMeldGroup: {
    display: "flex", gap: s(2), background: "transparent", padding: `${s(3)}px ${s(6)}px`,
    borderRadius: s(6), border: "none", alignItems: "center",
  },
  playerMeldTile: { ...tileBase, fontSize: s(48), lineHeight: 1 },
  meldTag: { fontSize: ts(8), color: greenDim, marginLeft: s(4), textTransform: "uppercase", letterSpacing: 1 },

  // Player hand
  playerHand: {
    display: "flex", gap: s(4), justifyContent: "center", flexWrap: "wrap",
  },
  handTile: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: `${s(6)}px ${s(4)}px ${s(4)}px`, background: "#f8f1de",
    border: `1px solid #3a2a1a`, borderRadius: s(6),
    boxShadow: `inset 0 -${s(3)}px 0 rgba(0,0,0,0.12), 0 ${s(2)}px ${s(4)}px rgba(0,0,0,0.35)`,
    cursor: "default", transition: "all 0.15s ease-out",
  },
  handTileSelected: {
    transform: `translateY(-${s(10)}px)`, filter: "brightness(1.15)",
  },
  handTileClickable: { cursor: "pointer", outline: "none" },
  tileImg: { fontSize: s(60), lineHeight: 1, display: "block", marginBottom: s(8) },
  tileLabel: { fontSize: ts(9), color: "#5a4a2a", marginTop: 0, textTransform: "capitalize", whiteSpace: "nowrap" },

  // ---- OVERLAYS ----
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center",
    justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)", padding: s(16),
  },
  // ---- CLAIM BANNER ----
  claimBanner: {
    flexShrink: 0, position: "relative", zIndex: 10,
    background: "linear-gradient(to bottom, rgba(26,58,42,0.95), rgba(13,31,23,0.97))",
    borderTop: `1px solid ${gold}`, borderBottom: `1px solid ${gold}`,
    boxShadow: "0 4px 20px rgba(201,169,97,0.15), 0 -4px 20px rgba(201,169,97,0.15)",
    padding: `${s(8)}px ${s(16)}px`,
  },
  claimBannerInner: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    maxWidth: s(900), margin: "0 auto", gap: s(14), flexWrap: "wrap",
  },
  claimBannerLeft: {
    display: "flex", alignItems: "center", gap: s(10),
  },
  claimBannerText: { display: "flex", flexDirection: "column", gap: 2 },
  claimTitle: { color: "#d4c9a8", fontSize: ts(14), margin: 0, lineHeight: 1.4 },
  claimTileBig: { ...tileBase, fontSize: s(60), lineHeight: 1 },
  claimQuestion: { color: gold, fontSize: ts(13), margin: 0 },
  claimBannerBtns: { display: "flex", gap: s(6), alignItems: "center", flexWrap: "wrap" },
  claimAccept: {
    background: `linear-gradient(135deg, ${gold}, #a8873d)`, color: bg, border: "none",
    padding: `${s(10)}px ${s(20)}px`, borderRadius: s(6), cursor: "pointer", outline: "none", fontSize: ts(14), fontWeight: "bold",
    whiteSpace: "nowrap", minHeight: s(38), touchAction: "manipulation",
  },
  claimDecline: {
    background: "rgba(255,255,255,0.08)", border: `1px solid ${goldDim}`, color: green,
    padding: `${s(10)}px ${s(20)}px`, borderRadius: s(6), cursor: "pointer", outline: "none", fontSize: ts(13), whiteSpace: "nowrap",
    minHeight: s(38), touchAction: "manipulation",
  },
  chiBtnGlyphs: {
    fontSize: s(28), lineHeight: 1, letterSpacing: s(2),
    display: "inline-flex", alignItems: "center", verticalAlign: "middle",
  },

  // Round over
  roundOverBox: {
    background: `linear-gradient(145deg, ${bgLight}, ${bg})`, border: `2px solid ${gold}`,
    borderRadius: s(14), padding: `${s(28)}px ${s(36)}px`, textAlign: "center", maxWidth: s(500), width: "100%",
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    maxHeight: "88vh", overflowY: "auto",
  },
  roundOverActions: {
    display: "flex", gap: s(10), justifyContent: "center", alignItems: "center",
    flexWrap: "wrap", marginTop: s(8),
  },
  tabBar: {
    display: "flex", borderBottom: `2px solid rgba(201,169,97,0.18)`,
    marginBottom: s(14), gap: 0,
  },
  // Grid-stack: all panes share the same cell so the container sizes to the
  // tallest pane and the modal stops resizing as you switch tabs.
  tabPanes: { display: "grid" },
  tabPane: { gridColumn: 1, gridRow: 1, minWidth: 0 },
  tabPaneHidden: { visibility: "hidden", pointerEvents: "none" },
  tabBtn: {
    flex: 1, background: "transparent", border: "none",
    color: greenDim, padding: `${s(8)}px ${s(8)}px`,
    fontSize: ts(12), letterSpacing: 1.2, textTransform: "uppercase",
    cursor: "pointer", outline: "none", fontWeight: "bold",
    borderBottom: "2px solid transparent", marginBottom: -2,
    transition: "color 0.15s, border-color 0.15s",
  },
  tabBtnActive: {
    color: gold,
    borderBottomColor: gold,
  },
  winTitle: { color: gold, fontSize: s(28), margin: `0 0 ${s(16)}px` },
  winningHand: { marginBottom: s(20) },
  winHandLabel: { color: green, fontSize: ts(11), textTransform: "uppercase", letterSpacing: 2, marginBottom: s(8) },
  winTilesRow: { display: "flex", gap: s(6), justifyContent: "center", flexWrap: "wrap" },
  winMeldGroup: {
    display: "flex", gap: s(2), background: "transparent", padding: `${s(4)}px ${s(6)}px`,
    borderRadius: s(6), border: "none",
  },
  winTile: { ...tileBase, fontSize: s(48), lineHeight: 1 },
  winTileHighlight: {
    // No padded box (it would wrap the glyph's em-box, which sits above the
    // visible tile and shows up off-center). Use shape-following effects only:
    // drop-shadow follows the glyph silhouette, and text-shadow halos the glyph
    // itself, so the highlight is centered on what's actually drawn.
    filter: `brightness(1.2) saturate(1.35) drop-shadow(0 0 ${s(6)}px rgba(255,220,140,1)) drop-shadow(0 0 ${s(14)}px rgba(201,169,97,0.7))`,
    textShadow: `0 0 ${s(10)}px rgba(255,220,140,1), 0 0 ${s(22)}px rgba(201,169,97,0.6)`,
  },
  winningTileLabel: {
    color: gold, fontSize: ts(11), letterSpacing: 1, textTransform: "uppercase",
    marginTop: s(8), fontWeight: "bold",
  },
  winTypeBadge: {
    color: "#d4c9a8", fontSize: ts(12), letterSpacing: 1.5, textTransform: "uppercase",
    marginBottom: s(12), fontWeight: "bold",
  },
  breakdownBox: {
    background: "rgba(0,0,0,0.3)", border: `1px solid rgba(201,169,97,0.25)`,
    borderRadius: s(8), padding: `${s(10)}px ${s(14)}px`, margin: `${s(6)}px 0 ${s(16)}px`,
    textAlign: "left",
  },
  breakdownTitle: {
    color: gold, fontSize: ts(11), letterSpacing: 2, textTransform: "uppercase",
    marginBottom: s(4), fontWeight: "bold",
  },
  breakdownBase: { color: greenDim, fontSize: ts(11), marginBottom: s(6) },
  breakdownRow: {
    display: "grid", gridTemplateColumns: "auto 1fr auto auto",
    gap: s(8), alignItems: "center", padding: `${s(3)}px 0`,
    borderTop: "1px dashed rgba(201,169,97,0.12)", fontSize: ts(12),
  },
  breakdownName: { color: "#d4c9a8", fontWeight: "bold" },
  breakdownMods: { color: greenDim, fontStyle: "italic" },
  breakdownDeltaPos: { color: "#7dd498", fontWeight: "bold" },
  breakdownDeltaNeg: { color: "#d48a8a", fontWeight: "bold" },
  breakdownTotal: { color: gold, fontFamily: "monospace" },
  gameOverText: { color: gold, fontSize: ts(16), marginBottom: s(16) },

  // Final standings
  finalStandingsLabel: {
    color: gold, fontSize: ts(12), textTransform: "uppercase", letterSpacing: 2,
    marginBottom: s(12), fontWeight: "bold",
  },
  standingsBox: {
    background: "rgba(0,0,0,0.3)", border: `1px solid rgba(201,169,97,0.25)`,
    borderRadius: s(8), padding: `${s(8)}px ${s(14)}px`, marginBottom: s(20),
    textAlign: "left",
  },
  standingsRow: {
    display: "grid", gridTemplateColumns: "auto 1fr auto",
    gap: s(12), alignItems: "center", padding: `${s(6)}px 0`,
    borderTop: "1px dashed rgba(201,169,97,0.12)", fontSize: ts(13),
    color: "#d4c9a8",
  },
  standingsRowWinner: {
    display: "grid", gridTemplateColumns: "auto 1fr auto",
    gap: s(12), alignItems: "center", padding: `${s(8)}px 0`,
    fontSize: ts(15), color: gold, fontWeight: "bold",
  },
  standingsRank: { fontFamily: "monospace" },
  standingsName: {},
  standingsScore: { fontFamily: "monospace" },

  // Stats views (round and game)
  statsView: { textAlign: "left" },
  statsHeader: {
    color: "#d4c9a8", fontSize: ts(12), letterSpacing: 0.5, marginBottom: s(10),
    textAlign: "center",
  },
  statsKvBox: {
    background: "rgba(0,0,0,0.25)", border: "1px solid rgba(201,169,97,0.18)",
    borderRadius: s(8), padding: `${s(6)}px ${s(12)}px`, marginBottom: s(10),
  },
  statsKvRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: `${s(4)}px 0`, fontSize: ts(12),
  },
  statsKvLabel: { color: greenDim, textTransform: "uppercase", letterSpacing: 1, fontSize: ts(10) },
  statsKvValue: { color: gold, fontFamily: "monospace", fontWeight: "bold" },
  statsSubtitle: {
    color: gold, fontSize: ts(11), textTransform: "uppercase", letterSpacing: 2,
    fontWeight: "bold", marginTop: s(12), marginBottom: s(6),
  },
  statsTable: {
    background: "rgba(0,0,0,0.25)", border: "1px solid rgba(201,169,97,0.18)",
    borderRadius: s(8), padding: `${s(6)}px ${s(8)}px`, marginBottom: s(8),
  },
  statsTableHeaderRow: {
    display: "grid", gridTemplateColumns: "1.4fr repeat(4, 1fr)",
    gap: s(4), padding: `${s(4)}px 0`, borderBottom: "1px solid rgba(201,169,97,0.2)",
  },
  statsTableHeader: {
    color: gold, fontSize: ts(10), letterSpacing: 1, textTransform: "uppercase",
    fontWeight: "bold", textAlign: "center",
  },
  statsTableRow: {
    display: "grid", gridTemplateColumns: "1.4fr repeat(4, 1fr)",
    gap: s(4), padding: `${s(4)}px 0`, borderTop: "1px dashed rgba(201,169,97,0.08)",
    fontSize: ts(11),
  },
  statsTableRowLabel: { color: greenDim, fontSize: ts(10) },
  statsTableCell: {
    color: "#d4c9a8", fontFamily: "monospace", textAlign: "center",
  },
  bestRoundLine: {
    color: gold, fontSize: ts(13), fontWeight: "bold", marginBottom: s(4),
  },
  bankruptcyList: { display: "flex", flexDirection: "column", gap: s(2) },
  bankruptcyLine: { color: "#f0a0a0", fontSize: ts(12) },
  historyBox: {
    background: "rgba(0,0,0,0.25)", border: "1px solid rgba(201,169,97,0.18)",
    borderRadius: s(8), padding: `${s(4)}px ${s(10)}px`, marginBottom: s(12),
    maxHeight: s(180), overflowY: "auto",
  },
  historyRow: {
    display: "flex", gap: s(8), padding: `${s(3)}px 0`,
    borderTop: "1px dashed rgba(201,169,97,0.08)", fontSize: ts(11),
    alignItems: "baseline",
  },
  historyRound: {
    color: gold, fontFamily: "monospace", minWidth: s(28), fontSize: ts(11),
    fontWeight: "bold",
  },
  historyEntry: { color: "#d4c9a8", flex: 1 },
  historyName: { color: gold, fontWeight: "bold" },
  historyGain: { color: "#7dd498", fontFamily: "monospace", fontWeight: "bold" },

  // Help overlay
  helpPanel: {
    background: `linear-gradient(145deg, ${bgLight}, ${bg})`, border: `2px solid ${gold}`,
    borderRadius: s(14), padding: 0, maxWidth: s(640), width: "90%", maxHeight: "85vh",
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
  },
  helpHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: `${s(16)}px ${s(24)}px`, borderBottom: `1px solid rgba(201,169,97,0.2)`, flexShrink: 0,
  },
  helpTitle: { color: gold, fontSize: s(22), margin: 0, letterSpacing: 2 },
  helpScroll: {
    overflowY: "auto", padding: `${s(16)}px ${s(24)}px ${s(24)}px`, flex: 1,
  },
  helpSectionTitle: {
    color: gold, fontSize: ts(14), margin: `${s(20)}px 0 ${s(8)}px`, letterSpacing: 1,
  },
  helpText: {
    color: "#d4c9a8", fontSize: ts(13), lineHeight: 1.7, margin: `${s(4)}px 0`,
  },
  helpRuleBox: {
    background: "rgba(0,0,0,0.2)", border: "1px solid rgba(201,169,97,0.12)",
    borderRadius: s(8), padding: `${s(10)}px ${s(14)}px`, margin: `${s(8)}px 0`,
  },

  // ---- ADMIN CONSOLE ----
  adminPanel: {
    background: `linear-gradient(145deg, ${bgLight}, ${bg})`, border: `2px solid ${gold}`,
    borderRadius: s(14), padding: 0, maxWidth: s(720), width: "92%", maxHeight: "88vh",
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
  },
  adminHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: `${s(14)}px ${s(20)}px`, borderBottom: `1px solid rgba(201,169,97,0.2)`, flexShrink: 0,
  },
  adminTitle: { color: gold, fontSize: s(20), margin: 0, letterSpacing: 2 },
  adminScroll: {
    overflowY: "auto", padding: `${s(14)}px ${s(20)}px`, flex: 1,
  },
  adminLegend: { color: greenDim, fontSize: ts(11), lineHeight: 1.5, margin: `${s(4)}px 0` },
  adminTopRow: {
    display: "flex", gap: s(14), flexWrap: "wrap", marginTop: s(12), marginBottom: s(10),
  },
  adminInlineLabel: {
    color: gold, fontSize: ts(12), display: "inline-flex", alignItems: "center", gap: s(6),
  },
  adminField: { display: "flex", flexDirection: "column", gap: s(4), marginTop: s(8) },
  adminLabel: { color: gold, fontSize: ts(11), letterSpacing: 1, textTransform: "uppercase", fontWeight: "bold" },
  adminTextarea: {
    background: "rgba(0,0,0,0.35)", border: `1px solid rgba(201,169,97,0.25)`,
    borderRadius: s(6), padding: `${s(6)}px ${s(10)}px`, color: "#d4c9a8",
    fontFamily: "monospace", fontSize: ts(12), outline: "none", resize: "vertical",
    width: "100%",
  },
  adminSelect: {
    background: "rgba(0,0,0,0.35)", border: `1px solid rgba(201,169,97,0.3)`, color: gold,
    padding: `${s(4)}px ${s(8)}px`, borderRadius: s(4), fontSize: ts(12), outline: "none",
  },
  adminScoreInput: {
    background: "rgba(0,0,0,0.35)", border: `1px solid rgba(201,169,97,0.3)`, color: gold,
    padding: `${s(4)}px ${s(8)}px`, borderRadius: s(4), fontSize: ts(12), outline: "none",
    width: s(80), fontFamily: "monospace",
  },
  adminPlayerBox: {
    background: "rgba(0,0,0,0.25)", border: `1px solid rgba(201,169,97,0.18)`,
    borderRadius: s(8), padding: `${s(10)}px ${s(14)}px`, marginTop: s(12),
  },
  adminPlayerHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    gap: s(10), flexWrap: "wrap",
  },
  adminPlayerName: { color: gold, fontSize: ts(13), fontWeight: "bold", letterSpacing: 1 },
  adminFooter: {
    display: "flex", justifyContent: "flex-end", gap: s(10),
    padding: `${s(12)}px ${s(20)}px`, borderTop: `1px solid rgba(201,169,97,0.2)`, flexShrink: 0,
  },

  // ---- MANAGE NAMES ----
  namesPanel: {
    background: `linear-gradient(145deg, ${bgLight}, ${bg})`, border: `2px solid ${gold}`,
    borderRadius: s(14), padding: 0, maxWidth: s(420), width: "92%", maxHeight: "85vh",
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
  },
  namesScroll: {
    overflowY: "auto", padding: `${s(14)}px ${s(20)}px`, flex: 1,
  },
  namesInputRow: {
    display: "flex", gap: s(8), marginTop: s(10), marginBottom: s(12),
  },
  namesInput: {
    flex: 1, background: "rgba(0,0,0,0.35)",
    border: `1px solid rgba(201,169,97,0.3)`, color: "#d4c9a8",
    padding: `${s(6)}px ${s(10)}px`, borderRadius: s(6),
    fontSize: ts(13), outline: "none",
  },
  namesList: {
    display: "flex", flexDirection: "column", gap: s(4),
    background: "rgba(0,0,0,0.25)", border: "1px solid rgba(201,169,97,0.18)",
    borderRadius: s(8), padding: `${s(6)}px ${s(10)}px`,
  },
  namesRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: `${s(4)}px ${s(2)}px`, fontSize: ts(13),
    borderBottom: "1px dashed rgba(201,169,97,0.08)",
  },
  namesRowText: { color: "#d4c9a8" },
  namesRemoveBtn: {
    background: "rgba(180,80,80,0.18)", border: "1px solid rgba(220,120,120,0.35)",
    color: "#f0a0a0", borderRadius: s(4), padding: `${s(0)}px ${s(8)}px`,
    cursor: "pointer", outline: "none", fontSize: ts(14), lineHeight: 1.2,
  },
  };
}
