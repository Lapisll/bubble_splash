import {
    Node, Graphics, Sprite, UITransform, UIOpacity, Label, Color, Vec3, tween, sys, math,
} from 'cc';
import { BUBBLE_COLORS, CFG } from '../config/GameConfig';
import { Assets } from '../config/Assets';

/**
 * Финальный экран (end card) + CTA — «максимум сока».
 * Всё строится в конструкторе в СКРЫТОМ состоянии; show() запускает
 * каскадный вход элементов + фоновый дождь пузырей + залп конфетти +
 * пульс-свечение за лого + gleam-вспышку по кнопке.
 * Весь экран кликабелен → переход в стор.
 */
export class Packshot {
    root: Node;
    private canvasW: number;
    private canvasH: number;

    private glowNode: Node = null!;
    private logoNode: Node = null!;
    private titleNode: Node = null!;
    private subNode: Node = null!;
    private btnNode: Node = null!;
    private rainLayer: Node = null!;
    private gleamNode: Node = null!;
    private gleamW = 0;
    private shown = false;

    constructor(parent: Node, canvasW: number, canvasH: number) {
        this.canvasW = canvasW;
        this.canvasH = canvasH;

        this.root = new Node('Packshot');
        parent.addChild(this.root);
        const ui = this.root.addComponent(UITransform);
        ui.setContentSize(canvasW, canvasH);
        this.root.active = false;

        // Затемняющая подложка
        const dim = new Node('dim');
        this.root.addChild(dim);
        dim.addComponent(UITransform).setContentSize(canvasW, canvasH);
        const dimG = dim.addComponent(Graphics);
        dimG.fillColor = new Color(11, 11, 42, 210);
        dimG.rect(-canvasW / 2, -canvasH / 2, canvasW, canvasH);
        dimG.fill();

        // Слой фонового дождя пузырей (за карточкой)
        this.rainLayer = new Node('rain');
        this.root.addChild(this.rainLayer);
        this.rainLayer.addComponent(UITransform);

        // Пульс-свечение за лого (мягкий неон-диск)
        this.glowNode = new Node('logoGlow');
        this.root.addChild(this.glowNode);
        this.glowNode.addComponent(UITransform);
        const gg = this.glowNode.addComponent(Graphics);
        for (let i = 3; i >= 1; i--) {
            gg.fillColor = new Color(0, 240, 255, Math.floor(30 / i));
            gg.circle(0, 0, 130 * (0.6 + i * 0.34));
            gg.fill();
        }
        this.glowNode.setPosition(0, canvasH * 0.22, 0);
        this.glowNode.addComponent(UIOpacity).opacity = 0;

        // Логотип: спрайт если вставлен, иначе неон-кольцо из цветных шаров (fallback)
        this.logoNode = new Node('logo');
        this.root.addChild(this.logoNode);
        this.logoNode.addComponent(UITransform);
        if (Assets.logo) {
            const size = Math.min(canvasW * 0.5, 360);
            const lu = this.logoNode.addComponent(UITransform);
            const sp = this.logoNode.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = Assets.logo;
            lu.setContentSize(size, size);          // размер последним
        } else {
            const ring = new Node('logoRing');
            this.logoNode.addChild(ring);
            ring.addComponent(UITransform);
            const lg = ring.addComponent(Graphics);
            for (let i = 0; i < BUBBLE_COLORS.length; i++) {
                const c = BUBBLE_COLORS[i];
                const a = (i / BUBBLE_COLORS.length) * Math.PI * 2;
                lg.fillColor = new Color(c.r, c.g, c.b, 90);
                lg.circle(Math.cos(a) * 60, Math.sin(a) * 60, 55);
                lg.fill();
            }
            tween(ring).by(6, { angle: 360 }).repeatForever().start();
        }
        this.logoNode.setPosition(0, canvasH * 0.22, 0);

        // Заголовок
        this.titleNode = new Node('title');
        this.root.addChild(this.titleNode);
        const tl = this.titleNode.addComponent(Label);
        tl.string = 'BUBBLE SPLASH';
        tl.fontSize = 80;
        tl.lineHeight = 80;
        tl.isBold = true;
        tl.color = new Color(0, 240, 255, 255);
        this.titleNode.setPosition(0, canvasH * 0.05, 0);

        // Слоган
        this.subNode = new Node('slogan');
        this.root.addChild(this.subNode);
        const sl = this.subNode.addComponent(Label);
        sl.string = 'Pop. Chain. Win.';
        sl.fontSize = 40;
        sl.lineHeight = 40;
        sl.color = new Color(255, 46, 159, 255);
        this.subNode.addComponent(UIOpacity).opacity = 0;
        this.subNode.setPosition(0, canvasH * 0.05 - 70, 0);

        // Кнопка CTA
        const btnW = canvasW * 0.7;
        const btnH = 130;
        this.btnNode = new Node('cta');
        this.root.addChild(this.btnNode);
        const btnUi = this.btnNode.addComponent(UITransform);
        btnUi.setContentSize(btnW, btnH);

        if (Assets.cta) {
            const sp = this.btnNode.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = Assets.cta;
            btnUi.setContentSize(btnW, btnH);       // размер последним
        } else {
            const bg = this.btnNode.addComponent(Graphics);
            bg.fillColor = new Color(180, 255, 57, 90);        // свечение
            bg.roundRect(-btnW / 2 - 10, -btnH / 2 - 10, btnW + 20, btnH + 20, 40);
            bg.fill();
            bg.fillColor = new Color(180, 255, 57, 255);       // тело
            bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 32);
            bg.fill();

            const btnLbl = new Node('ctaText');
            this.btnNode.addChild(btnLbl);
            const bl = btnLbl.addComponent(Label);
            bl.string = 'PLAY NOW  ▶';
            bl.fontSize = 56;
            bl.lineHeight = 56;
            bl.isBold = true;
            bl.color = new Color(11, 11, 42, 255);
        }
        this.btnNode.setPosition(0, -canvasH * 0.28, 0);

        // gleam-блик, скользящий по кнопке (поверх, узкий белый овал)
        const gleam = new Node('gleam');
        this.btnNode.addChild(gleam);
        gleam.addComponent(UITransform);
        const glg = gleam.addComponent(Graphics);
        glg.fillColor = new Color(255, 255, 255, 110);
        glg.ellipse(0, 0, 26, btnH * 0.55);
        glg.fill();
        const gleamOp = gleam.addComponent(UIOpacity);
        gleamOp.opacity = 0;
        this.gleamNode = gleam;
        this.gleamW = btnW;

        // Весь экран → клик в стор
        this.root.on(Node.EventType.TOUCH_END, this.onClick, this);
    }

    show() {
        if (this.shown) return;
        this.shown = true;
        this.root.active = true;

        const cH = this.canvasH;
        const s = CFG.pkStagger;

        // фоновый дождь пузырей + пульс-свечение — сразу
        this.startBubbleRain();
        tween(this.glowNode.getComponent(UIOpacity)!)
            .to(0.4, { opacity: 255 }).start();
        tween(this.glowNode)
            .to(1.3, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineInOut' })
            .to(1.3, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union().repeatForever().start();

        // Лого: «падает» сверху с отскоком
        this.enterNode(this.logoNode, cH * 0.22 + CFG.pkLogoDrop, cH * 0.22, 0.6);
        // Заголовок: pop из точки
        this.enterScale(this.titleNode, s);
        // Слоган: проявление
        tween(this.subNode.getComponent(UIOpacity)!)
            .delay(s * 2).to(0.3, { opacity: 255 }).start();
        // Кнопка: pop, затем «дыхание» + gleam
        this.enterScale(this.btnNode, s * 3, () => {
            tween(this.btnNode)
                .to(0.7, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' })
                .to(0.7, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
                .union().repeatForever().start();
            this.startGleam();
        });

        // Залп конфетти
        this.burstConfetti();
    }

    /** Появление узла «сверху вниз» с отскоком + проявлением. */
    private enterNode(node: Node, fromY: number, toY: number, delay: number) {
        node.setPosition(0, fromY, 0);
        node.setScale(0.6, 0.6, 1);
        const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        op.opacity = 0;
        tween(node).delay(delay)
            .to(0.45, { position: new Vec3(0, toY, 0), scale: new Vec3(1, 1, 1) },
                { easing: 'backOut' })
            .start();
        tween(op).delay(delay).to(0.3, { opacity: 255 }).start();
    }

    /** Появление узла масштабом из точки (pop). */
    private enterScale(node: Node, delay: number, onDone?: () => void) {
        node.setScale(0, 0, 1);
        const t = tween(node).delay(delay)
            .to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' });
        if (onDone) t.call(onDone);
        t.start();
    }

    /** Периодический блик, скользящий поперёк кнопки. */
    private startGleam() {
        const half = this.gleamW / 2 + 40;
        const run = () => {
            if (!this.gleamNode.isValid) return;
            this.gleamNode.setPosition(-half, 0, 0);
            this.gleamNode.getComponent(UIOpacity)!.opacity = 110;
            tween(this.gleamNode)
                .to(0.5, { position: new Vec3(half, 0, 0) }, { easing: 'sineIn' })
                .start();
        };
        run();
        tween(this.gleamNode).delay(CFG.pkShineTime).call(run).union().repeatForever().start();
    }

    /** Фоновый дождь неон-пузырей, поднимающихся снизу вверх (loop). */
    private startBubbleRain() {
        const halfW = this.canvasW / 2;
        const halfH = this.canvasH / 2;
        for (let i = 0; i < CFG.pkRainCount; i++) {
            const n = new Node('rb');
            this.rainLayer.addChild(n);
            n.addComponent(UITransform);
            const g = n.addComponent(Graphics);
            const c = BUBBLE_COLORS[math.randomRangeInt(0, BUBBLE_COLORS.length)];
            const r = math.randomRange(10, 26);
            g.fillColor = new Color(c.r, c.g, c.b, 70);
            g.circle(0, 0, r);
            g.fill();
            g.fillColor = new Color(255, 255, 255, 60);
            g.circle(-r * 0.3, r * 0.3, r * 0.25);
            g.fill();

            const x = math.randomRange(-halfW, halfW);
            const dur = math.randomRange(3.5, 7);
            const startDelay = math.randomRange(0, 5);
            n.setPosition(x, -halfH - r, 0);
            tween(n)
                .delay(startDelay)
                .to(dur, { position: new Vec3(x + math.randomRange(-30, 30), halfH + r, 0) },
                    { easing: 'sineInOut' })
                .union().repeatForever().start();
        }
    }

    /** Стартовый залп конфетти из-за верхнего края. */
    private burstConfetti() {
        const halfW = this.canvasW / 2;
        const topY = this.canvasH / 2;
        for (let i = 0; i < CFG.pkConfettiCount; i++) {
            const n = new Node('cf');
            this.root.addChild(n);
            n.addComponent(UITransform);
            const g = n.addComponent(Graphics);
            const c = BUBBLE_COLORS[math.randomRangeInt(0, BUBBLE_COLORS.length)];
            const w = math.randomRange(8, 16);
            const h = math.randomRange(12, 22);
            g.fillColor = new Color(c.r, c.g, c.b, 255);
            g.rect(-w / 2, -h / 2, w, h);
            g.fill();

            const sx = math.randomRange(-halfW, halfW);
            n.setPosition(sx, topY + math.randomRange(0, 120), 0);
            n.angle = math.randomRange(0, 360);

            const op = n.addComponent(UIOpacity);
            const fall = math.randomRange(1.4, 2.6);
            const ex = sx + math.randomRange(-120, 120);
            const ey = -topY - 60;
            tween(n)
                .to(fall, { position: new Vec3(ex, ey, 0) }, { easing: 'quadIn' })
                .call(() => n.isValid && n.destroy())
                .start();
            tween(n).by(fall, { angle: math.randomRange(-360, 360) }).start();
            tween(op).delay(fall * 0.6).to(fall * 0.4, { opacity: 0 }).start();
        }
    }

    private onClick() {
        // TODO: подставить ссылки стора / трекинг-клик MRAID.
        const url = 'https://play.google.com/store'; // placeholder
        if (sys.isBrowser) {
            sys.openURL(url);
        }
        console.log('[Packshot] CTA clicked → store redirect');
    }
}
