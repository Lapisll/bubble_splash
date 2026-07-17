import {
    _decorator, Component, Node, Graphics, Sprite, UITransform, UIOpacity, Widget, Color, Vec2, Vec3,
    EventTouch, math, tween, SpriteFrame, Prefab, AudioClip, AudioSource,
} from 'cc';
import { CFG, BUBBLE_COLORS, BG_TOP, BG_BOTTOM } from '../config/GameConfig';
import { Assets } from '../config/Assets';
import { Bubble } from '../entities/Bubble';
import { Fx } from '../fx/Fx';
import { Sfx } from '../fx/Sfx';
import { Hud } from '../ui/Hud';
import { Packshot } from '../ui/Packshot';

const { ccclass, property } = _decorator;

enum State { AIMING, FLYING, WON }

/** Снаряд в очереди: цвет (0..N-1) или бомба. */
const BOMB = -1;

/**
 * Главный компонент. Вешается на Canvas.
 * Строит всю сцену кодом: фон, поле, пусковой шар, прицел, HUD, пекшот.
 */
@ccclass('Game')
export class Game extends Component {
    // --- Слоты ассетов (опциональны; пусто → Graphics-неон fallback) ---
    @property({ type: SpriteFrame, tooltip: 'Спрайт шара (светлый, тинтуется цветом)' })
    bubbleSprite: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: 'Отдельный спрайт свечения под тело (опц.)' })
    bubbleGlowSprite: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: 'Фон' })
    backgroundSprite: SpriteFrame | null = null;
    @property({ type: Prefab, tooltip: 'Префаб ParticleSystem2D для сплэша' })
    splashPrefab: Prefab | null = null;
    @property({ type: SpriteFrame, tooltip: 'Спрайт кнопки CTA' })
    ctaSprite: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: 'Логотип/иконка на пекшоте' })
    logoSprite: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: 'Подложка прогресс-бара' })
    progressBgSprite: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: 'Заливка прогресс-бара (FILLED)' })
    progressFillSprite: SpriteFrame | null = null;
    @property({ type: [SpriteFrame], tooltip: 'Кадры анимации бомбы (по порядку). Приоритетнее одиночного спрайта.' })
    bombFrames: SpriteFrame[] = [];
    @property({ type: SpriteFrame, tooltip: 'Одиночный спрайт бомбы (fallback, если нет кадров)' })
    bombSprite: SpriteFrame | null = null;
    @property({ type: AudioClip, tooltip: 'Звук лопания' })
    popSound: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: 'Звук отскока снаряда от стен' })
    bounceSound: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: 'Фоновая музыка (loop)' })
    music: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: 'Джингл победы' })
    winSound: AudioClip | null = null;

    // --- Node-слоты для видимости в редакторе (опц.) ---
    @property({ type: Node, tooltip: 'Готовая нода фона в сцене (видна в редакторе). Задана → код свой фон не строит.' })
    bgNode: Node | null = null;
    @property({ type: Node, tooltip: 'Нода-превью пушки в сцене (видна в редакторе). Задаёт позицию пуска; в игре скрывается.' })
    launcherNode: Node | null = null;

    private audio: AudioSource = null!;    // SFX (one-shot fallback)
    private bgm: AudioSource = null!;      // фоновая музыка (loop)

    // размеры канваса
    private W = 720;
    private H = 1280;
    // границы игрового поля
    private left = 0; private right = 0; private top = 0;
    private launcherY = 0;

    // слои
    private world: Node = null!;       // трясётся при shake
    private aimGfx: Graphics = null!;

    private bubbles: Bubble[] = [];
    private projectile: Bubble | null = null;

    private launcher: Bubble = null!;
    private previews: Bubble[] = [];   // очередь визуальных превью следующих снарядов
    private queue: number[] = [];      // очередь снарядов (цвет | BOMB), длиной queueCount
    private currentColor = 0;          // заряженный снаряд (цвет | BOMB)

    private hud: Hud = null!;
    private packshot: Packshot = null!;

    // danger line (только драма)
    private dangerY = 0;
    private dangerOp: UIOpacity = null!;
    private dangerTimer = 0;
    private dangerPhase = 0;
    private wasDanger = false;

    private state = State.AIMING;
    private score = 0;
    private spawnTimer = 0;

    // juice-состояние
    private hitstop = 0;
    private shake = 0;
    private shakeMag = 0;
    private timeScale = 1;
    private trailTimer = 0;

    // прицел
    private aiming = false;
    private aimDir = new Vec2(0, 1);

    onLoad() {
        // прокидываем @property-слоты в общий холдер ассетов
        Assets.bubble = this.bubbleSprite;
        Assets.bubbleGlow = this.bubbleGlowSprite;
        Assets.background = this.backgroundSprite;
        Assets.splashPrefab = this.splashPrefab;
        Assets.cta = this.ctaSprite;
        Assets.logo = this.logoSprite;
        Assets.progressBg = this.progressBgSprite;
        Assets.progressFill = this.progressFillSprite;
        Assets.bombFrames = this.bombFrames;
        Assets.bomb = this.bombSprite;
        Assets.popSound = this.popSound;
        Assets.bounceSound = this.bounceSound;
        Assets.music = this.music;
        Assets.winSound = this.winSound;

        this.audio = this.node.addComponent(AudioSource);
        Sfx.init(this.audio);
        this.startMusic();

        const ui = this.node.getComponent(UITransform);
        if (ui) { this.W = ui.contentSize.width; this.H = ui.contentSize.height; }

        this.left = -this.W / 2 + CFG.sideFrame + CFG.sideMargin + CFG.bubbleRadius;
        this.right = this.W / 2 - CFG.sideFrame - CFG.sideMargin - CFG.bubbleRadius;
        this.top = this.H / 2 - CFG.topMargin;
        // позиция пуска: из ноды-превью (если задана в редакторе) либо из конфига
        this.launcherY = this.launcherNode
            ? this.launcherNode.position.y
            : -this.H / 2 + CFG.bottomMargin;
        if (this.launcherNode) this.launcherNode.active = false;  // это лишь превью для редактора

        this.buildBackground();

        this.world = new Node('World');
        this.node.addChild(this.world);
        this.world.addComponent(UITransform);

        this.buildDangerLine();

        const fxLayer = new Node('Fx');
        this.world.addChild(fxLayer);
        fxLayer.addComponent(UITransform);
        Fx.init(fxLayer);

        const aimNode = new Node('Aim');
        this.world.addChild(aimNode);
        aimNode.addComponent(UITransform);
        this.aimGfx = aimNode.addComponent(Graphics);

        this.hud = new Hud(this.node, this.W, this.H);
        this.packshot = new Packshot(this.node, this.W, this.H);

        // Пусковой шар создаём ДО спавна поля — чтобы он гарантированно был,
        // даже если что-то в спавне пойдёт не так.
        this.buildLauncher();
        this.spawnInitial();

        // поле готово — заряжаем цветной шар (не бомбу для обучаемости) и набиваем очередь
        this.currentColor = this.pickFieldColor();
        this.queue = [];
        for (let i = 0; i < CFG.queueCount; i++) this.queue.push(this.pickNextShot());
        this.applyShot(this.launcher, this.currentColor, true);
        this.updatePreviews();

        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    // ---------- Построение сцены ----------

    private buildBackground() {
        // если фон уже есть отдельной нодой в сцене (видимой в редакторе) — код свой не строит
        if (this.bgNode) return;

        const bg = new Node('Bg');
        this.node.addChild(bg);
        bg.setSiblingIndex(0);

        const bgUi = bg.addComponent(UITransform);

        // Растягиваем фон на весь экран через Widget: цепляем к 4 краям родителя
        // (Canvas при alignCanvasWithScreen подогнан под экран → покрываем overscan).
        const w = bg.addComponent(Widget);
        w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
        w.top = w.bottom = w.left = w.right = 0;
        w.alignMode = Widget.AlignMode.ALWAYS;
        w.updateAlignment();                 // применяем размер уже в этом кадре

        if (Assets.background) {
            const sp = bg.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;   // CUSTOM до spriteFrame (Widget держит размер = экран)
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = Assets.background;
            return;
        }
        // fallback: тёмная заливка + светлое пятно в центре (радиальная имитация)
        const bw = bgUi.contentSize.width;
        const bh = bgUi.contentSize.height;
        const g = bg.addComponent(Graphics);
        g.fillColor = BG_BOTTOM;
        g.rect(-bw / 2, -bh / 2, bw, bh);
        g.fill();
        for (let i = 6; i >= 1; i--) {
            g.fillColor = new Color(BG_TOP.r, BG_TOP.g, BG_TOP.b, Math.floor(30));
            g.circle(0, bh * 0.1, (bw * 0.5) * (i / 6));
            g.fill();
        }
    }

    private buildLauncher() {
        this.launcher = new Bubble(this.world, 0, CFG.bubbleRadius * CFG.launcherScale);
        this.launcher.setPos(0, this.launcherY);
        this.launcher.startReadyPulse();           // «дыхание» заряженного шара

        // очередь превью следующих снарядов: горизонтальный ряд правее пушки
        const pr = CFG.bubbleRadius * CFG.previewScale;
        this.previews = [];
        for (let i = 0; i < CFG.queueCount; i++) {
            const b = new Bubble(this.world, 0, pr);
            b.setPos(CFG.previewX0 + i * CFG.previewGap, this.launcherY);
            b.startIdle();                          // лёгкое покачивание следующих
            this.previews.push(b);
        }
    }

    /** Пунктирная danger-линия над пушкой (только драма, без проигрыша). */
    private buildDangerLine() {
        this.dangerY = this.launcherY + CFG.dangerLineOffset;
        const n = new Node('Danger');
        this.world.addChild(n);
        n.addComponent(UITransform);
        const g = n.addComponent(Graphics);
        // мягкое свечение-полоса
        g.fillColor = new Color(255, 50, 50, 45);
        g.rect(this.left - CFG.bubbleRadius, this.dangerY - 10,
            (this.right - this.left) + CFG.bubbleRadius * 2, 20);
        g.fill();
        // пунктир
        g.lineWidth = 4;
        g.strokeColor = new Color(255, 70, 70, 255);
        const x0 = this.left - CFG.bubbleRadius;
        const x1 = this.right + CFG.bubbleRadius;
        for (let x = x0; x < x1; x += 34) {
            g.moveTo(x, this.dangerY);
            g.lineTo(Math.min(x + 20, x1), this.dangerY);
        }
        g.stroke();
        this.dangerOp = n.addComponent(UIOpacity);
        this.dangerOp.opacity = 60;
    }

    // ---------- Спавн поля ----------

    private spawnInitial() {
        for (let i = 0; i < CFG.initialClusters; i++) {
            const y = this.top - i * (CFG.bubbleRadius * CFG.initialRowGap) - CFG.bubbleRadius;
            this.spawnCluster(y);
        }
    }

    /** Свободна ли точка от шаров ДРУГИХ кучек (уже стоящих на поле). */
    private isFreeOfForeign(x: number, y: number, minDist: number): boolean {
        for (const b of this.bubbles) {
            if (!b.alive) continue;
            if (Math.hypot(b.pos.x - x, b.pos.y - y) < minDist) return false;
        }
        return true;
    }

    private spawnCluster(atY?: number) {
        if (this.bubbles.length >= CFG.maxBubbles) return;
        const r = CFG.bubbleRadius;
        const foreign = r * CFG.foreignGap;
        const cy = atY !== undefined ? atY : this.top;

        // Ищем свободный центр (не над чужими шарами). Если места нет — пропускаем спавн.
        let cx = 0, found = false;
        for (let t = 0; t < 20; t++) {
            const tryX = math.randomRange(this.left + r, this.right - r);
            if (this.isFreeOfForeign(tryX, cy, foreign)) { cx = tryX; found = true; break; }
        }
        if (!found) return;

        const colorIndex = math.randomRangeInt(0, BUBBLE_COLORS.length);
        const count = math.randomRangeInt(CFG.clusterMin, CFG.clusterMax + 1);

        // Органический «блоб»: следующий шар лепим вплотную к случайному уже
        // поставленному в ЭТОЙ кучке, но не поверх чужих кучек.
        const pts: { x: number; y: number }[] = [{ x: cx, y: cy }];
        for (let i = 1; i < count; i++) {
            for (let tries = 0; tries < 12; tries++) {
                const base = pts[math.randomRangeInt(0, pts.length)];
                const ang = math.randomRange(0, Math.PI * 2);
                const dist = r * math.randomRange(CFG.clusterPackMin, CFG.clusterPackMax);
                const x = math.clamp(base.x + Math.cos(ang) * dist, this.left, this.right);
                const y = base.y + Math.sin(ang) * dist;
                if (y > this.top) continue;    // потолок: кучка растёт только под прогресс-баром
                const okSiblings = pts.every((p) => Math.hypot(p.x - x, p.y - y) >= r * 1.4);
                if (okSiblings && this.isFreeOfForeign(x, y, foreign)) {
                    pts.push({ x, y });
                    break;
                }
                // не нашли место за 12 попыток → этот шар пропускаем (кучка меньше)
            }
        }

        for (const p of pts) {
            const b = new Bubble(this.world, colorIndex, r);
            b.setPos(p.x, p.y);
            b.playSpawn();
            b.startIdle();
            this.bubbles.push(b);
        }
    }

    /** Цвет, гарантированно присутствующий на поле (плейбл всегда выигрывается). */
    private pickFieldColor(): number {
        if (this.bubbles.length === 0) return math.randomRangeInt(0, BUBBLE_COLORS.length);
        const b = this.bubbles[math.randomRangeInt(0, this.bubbles.length)];
        return b.colorIndex;
    }

    /** Следующий снаряд в очередь: иногда бомба, иначе цвет с поля. */
    private pickNextShot(): number {
        return Math.random() < CFG.bombChance ? BOMB : this.pickFieldColor();
    }

    /**
     * Применить дескриптор снаряда к шару (цвет или бомба).
     * @param animateBomb крутить анимацию бомбы (пушка/полёт) или показать статичный кадр (превью).
     */
    private applyShot(bubble: Bubble, shot: number, animateBomb: boolean) {
        if (shot === BOMB) bubble.setBomb(animateBomb);
        else bubble.setColorIndex(shot);
    }

    /** Перерисовать ряд превью по текущей очереди (превью-бомбы — статичный 1-й кадр). */
    private updatePreviews() {
        for (let i = 0; i < this.previews.length; i++) {
            this.applyShot(this.previews[i], this.queue[i], false);
        }
    }

    // ---------- Ввод / прицел ----------

    private toLocal(e: EventTouch): Vec3 {
        const p = e.getUILocation();
        const ui = this.node.getComponent(UITransform)!;
        return ui.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    }

    private onTouchStart(e: EventTouch) {
        if (this.state !== State.AIMING) return;
        this.aiming = true;
        this.updateAim(this.toLocal(e));
    }

    private onTouchMove(e: EventTouch) {
        if (!this.aiming) return;
        this.updateAim(this.toLocal(e));
    }

    private onTouchEnd(e: EventTouch) {
        if (!this.aiming) return;
        this.aiming = false;
        this.aimGfx.clear();
        if (this.state === State.AIMING) this.launch();
    }

    private updateAim(local: Vec3) {
        const dx = local.x - 0;
        const dy = local.y - this.launcherY;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        // целимся вверх; если тянут вниз — не даём стрелять в пол
        let ny = dy / len;
        let nx = dx / len;
        if (ny < 0.15) { ny = 0.15; const k = Math.hypot(nx, ny); nx /= k; ny /= k; }
        this.aimDir.set(nx, ny);
        this.drawTrajectory();
    }

    /** Пунктир с рикошетом от боковых стен + маркер попадания. */
    private drawTrajectory() {
        const g = this.aimGfx;
        g.clear();
        let px = 0, py = this.launcherY;
        let dx = this.aimDir.x, dy = this.aimDir.y;
        const stepLen = 26;
        const maxSteps = 90;
        const br = CFG.bubbleRadius;
        let hit = false;

        for (let s = 0; s < maxSteps && !hit; s++) {
            px += dx * stepLen;
            py += dy * stepLen;
            if (px < this.left) { px = this.left; dx = -dx; }
            else if (px > this.right) { px = this.right; dx = -dx; }

            if (py > this.top + br) break;

            // предполагаемое попадание
            for (const b of this.bubbles) {
                const d = Math.hypot(px - b.pos.x, py - b.pos.y);
                if (d <= br + b.radius) { hit = true; break; }
            }

            if (s % 2 === 0) {
                g.fillColor = new Color(255, 255, 255, 150);
                g.circle(px, py, 6);
                g.fill();
            }
        }
        // маркер точки попадания
        g.lineWidth = 4;
        g.strokeColor = new Color(0, 240, 255, 220);
        g.circle(px, py, br);
        g.stroke();
    }

    private launch() {
        const isBomb = this.currentColor === BOMB;
        const p = new Bubble(this.world, isBomb ? 0 : this.currentColor, CFG.bubbleRadius);
        if (isBomb) p.setBomb();
        p.isProjectile = true;
        p.setPos(0, this.launcherY);
        p.vel.set(this.aimDir.x * CFG.projSpeed, this.aimDir.y * CFG.projSpeed);
        this.projectile = p;
        this.trailTimer = 0;
        this.state = State.FLYING;
        this.launcher.node.active = false;
    }

    private reload() {
        // сдвигаем очередь: заряжаем ближайший, добираем новый в хвост
        this.currentColor = this.queue.shift()!;
        this.queue.push(this.pickNextShot());
        this.applyShot(this.launcher, this.currentColor, true);
        this.launcher.setPos(0, this.launcherY);
        this.launcher.node.active = true;
        this.updatePreviews();
        this.state = State.AIMING;
    }

    // ---------- Основной цикл ----------

    update(realDt: number) {
        // hitstop замораживает симуляцию мира, но не FX-твины
        if (this.hitstop > 0) {
            this.hitstop -= realDt;
            this.applyShake(realDt);
            return;
        }
        const dt = realDt * this.timeScale;

        // плавный возврат timeScale после slow-mo
        if (this.timeScale < 1) {
            this.timeScale = Math.min(1, this.timeScale + realDt / CFG.slowMoTime);
        }

        this.applyShake(realDt);

        if (this.state === State.WON) return;

        // опускание кластеров
        for (const b of this.bubbles) {
            b.setPos(b.pos.x, b.pos.y - CFG.descendSpeed * dt);
        }

        // спавн новых кучек
        this.spawnTimer += dt;
        if (this.spawnTimer >= CFG.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnCluster();
        }

        this.updateDanger(dt);

        // полёт снаряда
        if (this.state === State.FLYING && this.projectile) {
            this.moveProjectile(dt);
        }

        if (this.aiming) this.drawTrajectory();
    }

    private moveProjectile(dt: number) {
        const p = this.projectile!;
        let nx = p.pos.x + p.vel.x * dt;
        let ny = p.pos.y + p.vel.y * dt;

        if (nx < this.left) { nx = this.left; p.vel.x = -p.vel.x; this.playBounce(); }
        else if (nx > this.right) { nx = this.right; p.vel.x = -p.vel.x; this.playBounce(); }
        p.setPos(nx, ny);

        // трейл: роняем гаснущие призраки с фиксированным шагом по времени
        this.trailTimer += dt;
        while (this.trailTimer >= CFG.trailInterval) {
            this.trailTimer -= CFG.trailInterval;
            Fx.trail(nx, ny, p.color, CFG.bubbleRadius * 0.72);
        }

        // улетел вверх — промах
        if (ny > this.top + CFG.bubbleRadius * 2) {
            p.destroy();
            this.projectile = null;
            this.reload();
            return;
        }

        // столкновение
        for (const b of this.bubbles) {
            if (!b.alive) continue;
            const d = Math.hypot(nx - b.pos.x, ny - b.pos.y);
            if (d <= CFG.bubbleRadius + b.radius) {
                if (p.isBomb) {
                    this.explodeArea(nx, ny);         // бомба сносит область любых цветов
                } else if (b.colorIndex === p.colorIndex) {
                    this.onMatch(b, nx, ny);
                } else {
                    this.stickProjectile(p, b, nx, ny);  // чужой цвет — прилипает к кластеру
                }
                return;
            }
        }
    }

    /** Подрыв бомбы: сносит все шары в радиусе, независимо от цвета. */
    private explodeArea(hx: number, hy: number) {
        this.projectile!.destroy();
        this.projectile = null;

        const hits = this.bubbles.filter(
            (b) => b.alive && Math.hypot(hx - b.pos.x, hy - b.pos.y) <= CFG.bombRadius,
        );
        for (const b of hits) b.alive = false;
        this.bubbles = this.bubbles.filter((b) => b.alive);

        // очки (с бонусом бомбы), считаем сразу
        let gained = 0;
        for (const b of hits) {
            gained += Math.round(
                math.randomRange(CFG.scorePerBubbleMin, CFG.scorePerBubbleMax) * CFG.bombScoreMult,
            );
        }
        this.score += gained;
        this.hud.setScore(this.score);
        this.hud.setProgress(this.score);

        // бум: белая вспышка, кольцо, крупная тряска, низкий питч попа
        Fx.flash(hx, hy, CFG.bombRadius * 0.55);
        Fx.shockwave(hx, hy, new Color(255, 150, 60, 255), CFG.bombRadius);
        this.addShake(CFG.shakeBig);
        this.hitstop = CFG.hitstopBig;
        Sfx.pop(Assets.popSound, 0.5, CFG.sfxVolume);

        // осколки — волной от центра взрыва наружу, каждый своим цветом
        hits.sort((a, b) =>
            Math.hypot(hx - a.pos.x, hy - a.pos.y) - Math.hypot(hx - b.pos.x, hy - b.pos.y));
        hits.forEach((b, i) => {
            const node = b.node, px = b.pos.x, py = b.pos.y, col = b.color;
            this.scheduleOnce(() => {
                Fx.splash(px, py, col, CFG.bubbleRadius * 1.2);
                if (node && node.isValid) node.destroy();
            }, i * CFG.chainPopDelay * 0.6);
        });

        if (gained > 0) Fx.popup(hx, hy, `BOOM +${gained}`, new Color(255, 180, 80, 255), true);

        this.checkWin();
        if (this.state !== State.WON) this.reload();
    }

    /** Чужой цвет: снаряд встаёт вплотную к задетому шару и становится частью поля. */
    private stickProjectile(p: Bubble, hitBall: Bubble, nx: number, ny: number) {
        // отодвигаем на точку касания вдоль линии «задетый шар → снаряд»
        const dx = nx - hitBall.pos.x, dy = ny - hitBall.pos.y;
        const dist = Math.hypot(dx, dy) || 1;
        const rest = CFG.bubbleRadius + hitBall.radius;
        const sx = math.clamp(hitBall.pos.x + (dx / dist) * rest, this.left, this.right);
        const sy = hitBall.pos.y + (dy / dist) * rest;

        p.isProjectile = false;
        p.vel.set(0, 0);
        p.setPos(sx, sy);
        p.startIdle();                      // теперь качается как остальные шары поля
        this.bubbles.push(p);
        this.projectile = null;

        Fx.flash(sx, sy, CFG.bubbleRadius * 0.5);
        this.addShake(CFG.shakeSmall * 0.5);
        this.reload();
    }

    // ---------- Матч, комбо, splash ----------

    private onMatch(first: Bubble, hx: number, hy: number) {
        Fx.flash(hx, hy, CFG.bubbleRadius);
        this.projectile!.destroy();
        this.projectile = null;

        // волнами: стартовый кластер, затем цепь по тому же цвету
        let combo = 0;
        const color = first.colorIndex;
        let seeds: Bubble[] = [first];
        const visited = new Set<Bubble>();

        while (seeds.length > 0) {
            combo++;
            const group = this.collectCluster(seeds, color, visited);
            if (group.length === 0) break;

            this.popGroup(group, combo);

            // ищем следующую волну: тот же цвет в радиусе цепи
            const next: Bubble[] = [];
            for (const g of group) {
                for (const b of this.bubbles) {
                    if (!b.alive || visited.has(b) || b.colorIndex !== color) continue;
                    if (Math.hypot(g.pos.x - b.pos.x, g.pos.y - b.pos.y) <= CFG.chainRadius) {
                        next.push(b);
                    }
                }
            }
            seeds = next;
        }

        // hitstop + slow-mo по размеру комбо
        if (combo >= CFG.hitstopComboThreshold) {
            this.hitstop = CFG.hitstopBig;
            this.timeScale = CFG.timeScaleSlow;
        } else {
            this.hitstop = CFG.hitstopSmall;
        }

        this.checkWin();
        if (this.state !== State.WON) this.reload();
    }

    /** BFS: связный кластер того же цвета от набора seed-шаров. */
    private collectCluster(seeds: Bubble[], color: number, visited: Set<Bubble>): Bubble[] {
        const out: Bubble[] = [];
        const queue: Bubble[] = [];
        for (const s of seeds) {
            if (s.alive && !visited.has(s) && s.colorIndex === color) {
                visited.add(s); queue.push(s);
            }
        }
        const reach = CFG.bubbleRadius * 2 * CFG.contactFactor;
        while (queue.length > 0) {
            const cur = queue.shift()!;
            out.push(cur);
            for (const b of this.bubbles) {
                if (!b.alive || visited.has(b) || b.colorIndex !== color) continue;
                if (Math.hypot(cur.pos.x - b.pos.x, cur.pos.y - b.pos.y) <= reach) {
                    visited.add(b); queue.push(b);
                }
            }
        }
        return out;
    }

    private popGroup(group: Bubble[], combo: number) {
        const color = BUBBLE_COLORS[group[0].colorIndex];

        // Сразу «забираем» шары с поля: не таргетятся снарядом и не спускаются,
        // пока лопаются по очереди. Ноды живут до своей очереди в цепочке.
        for (const b of group) b.alive = false;
        this.bubbles = this.bubbles.filter((b) => b.alive);

        // Очки считаем сразу (иначе победа среагирует раньше, чем добежит анимация).
        let base = 0, cx = 0, cy = 0;
        for (const b of group) {
            base += Math.round(math.randomRange(CFG.scorePerBubbleMin, CFG.scorePerBubbleMax));
            cx += b.pos.x; cy += b.pos.y;
        }
        cx /= group.length; cy /= group.length;
        const gained = base * combo;
        this.score += gained;
        this.hud.setScore(this.score);
        this.hud.setProgress(this.score);
        this.playPop(combo);

        // Взрыв — по ЦЕПОЧКЕ: BFS-порядок = волна от точки попадания наружу.
        group.forEach((b, i) => {
            const node = b.node;
            const px = b.pos.x, py = b.pos.y;   // шары заморожены — позиция не изменится
            this.scheduleOnce(() => {
                Fx.splash(px, py, color, CFG.bubbleRadius * 1.2);
                this.addShake(i === 0 && combo >= CFG.hitstopComboThreshold ? CFG.shakeBig : CFG.shakeSmall);
                if (node && node.isValid) node.destroy();
            }, i * CFG.chainPopDelay);
        });

        if (combo >= 2) {
            Fx.popup(cx, cy, `x${combo} COMBO!`, new Color(255, 255, 255, 255), true);
        } else {
            Fx.popup(cx, cy, `+${gained}`, color, false);
        }
    }

    private checkWin() {
        if (this.score >= CFG.targetScore) {
            this.state = State.WON;
            this.aimGfx.clear();
            this.launcher.node.active = false;
            for (const p of this.previews) p.node.active = false;
            this.dangerOp.opacity = 0;
            // финальный каскад по всему полю → пекшот
            this.finalCascade();
        }
    }

    private finalCascade() {
        // приглушаем музыку под финал и играем джингл победы
        if (this.bgm && this.bgm.playing) {
            tween(this.bgm).to(0.5, { volume: CFG.musicVolume * CFG.musicDuckOnWin }).start();
        }
        if (Assets.winSound) this.audio.playOneShot(Assets.winSound, CFG.winVolume);

        const all = this.bubbles.slice();
        all.forEach((b, i) => {
            this.scheduleOnce(() => {
                if (!b.alive) return;
                Fx.splash(b.pos.x, b.pos.y, b.color, CFG.bubbleRadius * 1.2);
                this.addShake(CFG.shakeSmall);
                b.destroy();
            }, i * 0.04);
        });
        this.bubbles = [];
        this.scheduleOnce(() => this.packshot.show(), all.length * 0.04 + 0.5);
    }

    /** Драма danger-линии: пока нижние шары за ней — тряска + вспышка (без проигрыша). */
    private updateDanger(dt: number) {
        let lowest = Infinity;
        for (const b of this.bubbles) {
            if (b.alive) lowest = Math.min(lowest, b.pos.y - b.radius);
        }
        const inDanger = lowest <= this.dangerY;
        this.dangerPhase += dt;
        if (inDanger) {
            // ярко и быстро пульсирует
            const s = 0.5 + 0.5 * Math.sin(this.dangerPhase * 9);
            this.dangerOp.opacity = Math.round(150 + 90 * s);
            this.dangerTimer += dt;
            if (this.dangerTimer >= CFG.dangerShakeEvery) {
                this.dangerTimer = 0;
                this.addShake(CFG.dangerShakeMag);
            }
            if (!this.wasDanger) {                     // фронт: только что пересекли
                this.wasDanger = true;
                Fx.popup(0, this.dangerY + 44, 'DANGER!', new Color(255, 60, 60, 255), true);
            }
        } else {
            // спокойный тусклый пульс
            const s = 0.5 + 0.5 * Math.sin(this.dangerPhase * 2);
            this.dangerOp.opacity = Math.round(45 + 30 * s);
            this.wasDanger = false;
            this.dangerTimer = 0;
        }
    }

    // ---------- Juice helpers ----------

    private playBounce() {
        if (Assets.bounceSound) this.audio.playOneShot(Assets.bounceSound, CFG.sfxVolume);
    }

    private startMusic() {
        this.bgm = this.node.addComponent(AudioSource);
        if (!Assets.music) return;                 // нет трека → тишина (fallback)
        this.bgm.clip = Assets.music;
        this.bgm.loop = true;
        this.bgm.volume = 0;
        this.bgm.play();
        // fade-in громкости
        tween(this.bgm).to(CFG.musicFadeIn, { volume: CFG.musicVolume }).start();
    }

    private playPop(combo: number) {
        // Восходящий питч по комбо (Web Audio); fallback внутри Sfx — громкостью.
        const pitch = Math.min(CFG.popPitchMax, CFG.popPitchBase + (combo - 1) * CFG.popPitchStep);
        Sfx.pop(Assets.popSound, pitch, CFG.sfxVolume);
    }

    private addShake(mag: number) {
        this.shake = CFG.shakeTime;
        this.shakeMag = Math.max(this.shakeMag, mag);
    }

    private applyShake(realDt: number) {
        if (this.shake > 0) {
            this.shake -= realDt;
            const k = Math.max(0, this.shake / CFG.shakeTime);
            const m = this.shakeMag * k;
            this.world.setPosition(
                math.randomRange(-m, m),
                math.randomRange(-m, m),
                0,
            );
            if (this.shake <= 0) { this.world.setPosition(0, 0, 0); this.shakeMag = 0; }
        }
    }
}
