import { Node, Graphics, Sprite, UITransform, UIOpacity, Label, Color, Vec3, tween, sys } from 'cc';
import { BUBBLE_COLORS } from '../config/GameConfig';
import { Assets } from '../config/Assets';

/**
 * Финальный экран (end card) + CTA.
 * Появляется поверх всего, весь экран кликабелен → переход в стор.
 * Единственный «дышащий» акцент — кнопка PLAY NOW.
 */
export class Packshot {
    root: Node;

    constructor(parent: Node, canvasW: number, canvasH: number) {
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

        // Логотип: спрайт если вставлен, иначе вращающееся неон-кольцо (fallback)
        if (Assets.logo) {
            const logo = new Node('logo');
            this.root.addChild(logo);
            const size = Math.min(canvasW * 0.5, 360);
            const lu = logo.addComponent(UITransform);
            const sp = logo.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = Assets.logo;
            lu.setContentSize(size, size);          // размер последним
            logo.setPosition(0, canvasH * 0.22, 0);
        } else {
            const logoRing = new Node('logoRing');
            this.root.addChild(logoRing);
            logoRing.addComponent(UITransform);
            const lg = logoRing.addComponent(Graphics);
            for (let i = 0; i < BUBBLE_COLORS.length; i++) {
                const c = BUBBLE_COLORS[i];
                const a = (i / BUBBLE_COLORS.length) * Math.PI * 2;
                lg.fillColor = new Color(c.r, c.g, c.b, 90);
                lg.circle(Math.cos(a) * 60, Math.sin(a) * 60, 55);
                lg.fill();
            }
            logoRing.setPosition(0, canvasH * 0.22, 0);
            tween(logoRing).by(6, { angle: 360 }).repeatForever().start();
        }

        // Заголовок
        const title = new Node('title');
        this.root.addChild(title);
        const tl = title.addComponent(Label);
        tl.string = 'BUBBLE SPLASH';
        tl.fontSize = 80;
        tl.lineHeight = 80;
        tl.isBold = true;
        tl.color = new Color(0, 240, 255, 255);
        title.setPosition(0, canvasH * 0.05, 0);

        // Слоган
        const sub = new Node('slogan');
        this.root.addChild(sub);
        const sl = sub.addComponent(Label);
        sl.string = 'Pop. Chain. Win.';
        sl.fontSize = 40;
        sl.lineHeight = 40;
        sl.color = new Color(255, 46, 159, 255);
        sub.setPosition(0, canvasH * 0.05 - 70, 0);

        // Кнопка CTA: спрайт если вставлен, иначе Graphics-fallback с подписью
        const btnW = canvasW * 0.7;
        const btnH = 130;
        const btn = new Node('cta');
        this.root.addChild(btn);
        const btnUi = btn.addComponent(UITransform);
        btnUi.setContentSize(btnW, btnH);

        if (Assets.cta) {
            const sp = btn.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = Assets.cta;
            btnUi.setContentSize(btnW, btnH);       // размер последним
        } else {
            const bg = btn.addComponent(Graphics);
            bg.fillColor = new Color(180, 255, 57, 90);        // свечение
            bg.roundRect(-btnW / 2 - 10, -btnH / 2 - 10, btnW + 20, btnH + 20, 40);
            bg.fill();
            bg.fillColor = new Color(180, 255, 57, 255);       // тело
            bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 32);
            bg.fill();

            const btnLbl = new Node('ctaText');
            btn.addChild(btnLbl);
            const bl = btnLbl.addComponent(Label);
            bl.string = 'PLAY NOW  ▶';
            bl.fontSize = 56;
            bl.lineHeight = 56;
            bl.isBold = true;
            bl.color = new Color(11, 11, 42, 255);
        }
        btn.setPosition(0, -canvasH * 0.28, 0);

        // «дыхание» кнопки
        tween(btn)
            .to(0.7, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' })
            .to(0.7, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union().repeatForever().start();

        // Весь экран → клик в стор
        this.root.on(Node.EventType.TOUCH_END, this.onClick, this);
    }

    show() {
        this.root.active = true;
        const op = this.root.getComponent(UIOpacity) || this.root.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(0.35, { opacity: 255 }).start();
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
