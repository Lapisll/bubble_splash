import {
    _decorator, Component, Node, Graphics, Sprite, UITransform, Widget, Color, Vec2, Vec3,
    EventTouch, math, SpriteFrame, Prefab, AudioClip, AudioSource,
} from 'cc';
import { CFG, BUBBLE_COLORS, BG_TOP, BG_BOTTOM } from '../config/GameConfig';
import { Assets } from '../config/Assets';
import { Bubble } from '../entities/Bubble';
import { Fx } from '../fx/Fx';
import { Hud } from '../ui/Hud';
import { Packshot } from '../ui/Packshot';

const { ccclass, property } = _decorator;

enum State { AIMING, FLYING, WON }

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
    @property({ type: AudioClip, tooltip: 'Звук лопания' })
    popSound: AudioClip | null = null;

    private audio: AudioSource = null!;

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
    private nextPreview: Bubble = null!;
    private currentColor = 0;
    private nextColor = 0;

    private hud: Hud = null!;
    private packshot: Packshot = null!;

    private state = State.AIMING;
    private score = 0;
    private spawnTimer = 0;

    // juice-состояние
    private hitstop = 0;
    private shake = 0;
    private shakeMag = 0;
    private timeScale = 1;

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
        Assets.popSound = this.popSound;

        this.audio = this.node.addComponent(AudioSource);

        const ui = this.node.getComponent(UITransform);
        if (ui) { this.W = ui.contentSize.width; this.H = ui.contentSize.height; }

        this.left = -this.W / 2 + CFG.sideFrame + CFG.sideMargin + CFG.bubbleRadius;
        this.right = this.W / 2 - CFG.sideFrame - CFG.sideMargin - CFG.bubbleRadius;
        this.top = this.H / 2 - CFG.topMargin;
        this.launcherY = -this.H / 2 + CFG.bottomMargin;

        this.buildBackground();

        this.world = new Node('World');
        this.node.addChild(this.world);
        this.world.addComponent(UITransform);

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

        this.spawnInitial();
        this.buildLauncher();

        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    // ---------- Построение сцены ----------

    private buildBackground() {
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
        this.currentColor = this.pickFieldColor();
        this.nextColor = this.pickFieldColor();

        this.launcher = new Bubble(this.world, this.currentColor, CFG.bubbleRadius);
        this.launcher.setPos(0, this.launcherY);

        this.nextPreview = new Bubble(this.world, this.nextColor, CFG.bubbleRadius * 0.55);
        this.nextPreview.setPos(this.W * 0.28, this.launcherY - 10);
    }

    // ---------- Спавн поля ----------

    private spawnInitial() {
        for (let i = 0; i < CFG.initialClusters; i++) {
            const y = this.top - i * (CFG.bubbleRadius * 2.2) - CFG.bubbleRadius;
            this.spawnCluster(y);
        }
    }

    private spawnCluster(atY?: number) {
        if (this.bubbles.length >= CFG.maxBubbles) return;
        const colorIndex = math.randomRangeInt(0, BUBBLE_COLORS.length);
        const count = math.randomRangeInt(CFG.clusterMin, CFG.clusterMax + 1);
        const cx = math.randomRange(this.left + CFG.bubbleRadius, this.right - CFG.bubbleRadius);
        const cy = atY !== undefined ? atY : this.top;
        const r = CFG.bubbleRadius;

        // Органический «блоб»: каждый следующий шар лепим вплотную к случайному
        // уже поставленному под случайным углом. Плотно + хаотично + связно.
        const pts: { x: number; y: number }[] = [{ x: cx, y: cy }];
        for (let i = 1; i < count; i++) {
            let x = cx, y = cy;
            for (let tries = 0; tries < 8; tries++) {
                const base = pts[math.randomRangeInt(0, pts.length)];
                const ang = math.randomRange(0, Math.PI * 2);
                const dist = r * math.randomRange(CFG.clusterPackMin, CFG.clusterPackMax);
                x = math.clamp(base.x + Math.cos(ang) * dist, this.left, this.right);
                y = base.y + Math.sin(ang) * dist;
                // не сажаем поверх уже стоящего в этой кучке
                if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= r * 1.4)) break;
            }
            pts.push({ x, y });
        }

        for (const p of pts) {
            const b = new Bubble(this.world, colorIndex, r);
            b.setPos(p.x, p.y);
            this.bubbles.push(b);
        }
    }

    /** Цвет, гарантированно присутствующий на поле (плейбл всегда выигрывается). */
    private pickFieldColor(): number {
        if (this.bubbles.length === 0) return math.randomRangeInt(0, BUBBLE_COLORS.length);
        const b = this.bubbles[math.randomRangeInt(0, this.bubbles.length)];
        return b.colorIndex;
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
        const p = new Bubble(this.world, this.currentColor, CFG.bubbleRadius);
        p.isProjectile = true;
        p.setPos(0, this.launcherY);
        p.vel.set(this.aimDir.x * CFG.projSpeed, this.aimDir.y * CFG.projSpeed);
        this.projectile = p;
        this.state = State.FLYING;
        this.launcher.node.active = false;
    }

    private reload() {
        this.currentColor = this.nextColor;
        this.nextColor = this.pickFieldColor();
        this.launcher.setColorIndex(this.currentColor);
        this.launcher.setPos(0, this.launcherY);
        this.launcher.node.active = true;
        this.nextPreview.setColorIndex(this.nextColor);
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
        // HOOK: тут можно проверить пересечение danger-линии для «почти проигрыша».

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

        if (nx < this.left) { nx = this.left; p.vel.x = -p.vel.x; }
        else if (nx > this.right) { nx = this.right; p.vel.x = -p.vel.x; }
        p.setPos(nx, ny);

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
                if (b.colorIndex === p.colorIndex) {
                    this.onMatch(b, nx, ny);
                } else {
                    // «дад» — промах по чужому цвету
                    Fx.flash(nx, ny, CFG.bubbleRadius * 0.6);
                    this.addShake(CFG.shakeSmall * 0.5);
                    p.destroy();
                    this.projectile = null;
                    this.reload();
                }
                return;
            }
        }
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
        let cx = 0, cy = 0;
        const color = BUBBLE_COLORS[group[0].colorIndex];
        for (const b of group) {
            cx += b.pos.x; cy += b.pos.y;
            Fx.splash(b.pos.x, b.pos.y, color, CFG.bubbleRadius * 1.2);
            b.destroy();
        }
        cx /= group.length; cy /= group.length;

        this.playPop(combo);
        this.bubbles = this.bubbles.filter((b) => b.alive);

        const gained = group.length * CFG.scorePerBubble * combo;
        this.score += gained;
        this.hud.addPopped(group.length);
        this.hud.setProgress(this.score);

        this.addShake(combo >= CFG.hitstopComboThreshold ? CFG.shakeBig : CFG.shakeSmall);

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
            // финальный каскад по всему полю → пекшот
            this.finalCascade();
        }
    }

    private finalCascade() {
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

    // ---------- Juice helpers ----------

    private playPop(combo: number) {
        if (!Assets.popSound) return;
        // Cocos AudioSource на web не даёт менять pitch — громкостью намекаем на силу удара.
        // HOOK: восходящий питч по комбо через Web Audio, если нужно.
        this.audio.playOneShot(Assets.popSound, Math.min(1, 0.6 + combo * 0.15));
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
