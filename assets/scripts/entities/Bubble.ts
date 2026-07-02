import { Node, Graphics, Sprite, UITransform, Color, Vec2, Vec3 } from 'cc';
import { BUBBLE_COLORS } from '../config/GameConfig';
import { Assets } from '../config/Assets';

/**
 * Один шар. Рендерится двумя путями:
 *  - если в Assets вставлен спрайт → Sprite с тинтом по цвету (+ glow-спрайт);
 *  - иначе → Graphics-неон (fallback, работает без ассетов).
 * Плоский класс (не Component), чтобы Game дёшево держал их в массивах.
 */
export class Bubble {
    node: Node;
    private g: Graphics | null = null;
    private body: Sprite | null = null;
    private glow: Sprite | null = null;
    colorIndex: number;
    radius: number;
    vel: Vec2 = new Vec2(0, 0);   // используется снарядом
    alive = true;
    isProjectile = false;

    constructor(parent: Node, colorIndex: number, radius: number) {
        this.colorIndex = colorIndex;
        this.radius = radius;

        this.node = new Node('Bubble');
        parent.addChild(this.node);
        this.node.addComponent(UITransform).setContentSize(radius * 2, radius * 2);

        if (Assets.bubble) this.buildSprite();
        else this.buildGraphics();

        this.applyColor();
    }

    get color(): Color {
        return BUBBLE_COLORS[this.colorIndex];
    }

    get pos(): Vec3 {
        return this.node.position;
    }

    setPos(x: number, y: number) {
        this.node.setPosition(x, y, 0);
    }

    setColorIndex(i: number) {
        this.colorIndex = i;
        this.applyColor();
    }

    // ---------- Путь со спрайтами ----------

    private buildSprite() {
        const d = this.radius * 2;
        if (Assets.bubbleGlow) {
            const gn = new Node('glow');
            this.node.addChild(gn);
            const gu = gn.addComponent(UITransform);
            this.glow = gn.addComponent(Sprite);
            // CUSTOM ДО spriteFrame, иначе присвоение кадра растянет ноду под размер текстуры
            this.glow.sizeMode = Sprite.SizeMode.CUSTOM;
            this.glow.type = Sprite.Type.SIMPLE;
            this.glow.spriteFrame = Assets.bubbleGlow;
            gu.setContentSize(d * 1.7, d * 1.7);   // размер задаём последним — он и остаётся
        }
        const bn = new Node('body');
        this.node.addChild(bn);
        const bu = bn.addComponent(UITransform);
        this.body = bn.addComponent(Sprite);
        this.body.sizeMode = Sprite.SizeMode.CUSTOM;
        this.body.type = Sprite.Type.SIMPLE;
        this.body.spriteFrame = Assets.bubble;
        bu.setContentSize(d, d);                   // размер задаём последним — он и остаётся
    }

    // ---------- Путь с Graphics (неон-fallback) ----------

    private buildGraphics() {
        this.g = this.node.addComponent(Graphics);
    }

    private applyColor() {
        const c = this.color;
        if (this.body) {
            this.body.color = c;
            if (this.glow) this.glow.color = new Color(c.r, c.g, c.b, 150);
            return;
        }
        // Graphics-неон
        const g = this.g!;
        const r = this.radius;
        g.clear();
        for (let i = 3; i >= 1; i--) {
            g.fillColor = new Color(c.r, c.g, c.b, Math.floor(38 / i));
            g.circle(0, 0, r * (1 + i * 0.32));
            g.fill();
        }
        g.fillColor = c;
        g.circle(0, 0, r);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = new Color(255, 255, 255, 130);
        g.circle(0, 0, r);
        g.stroke();
        g.fillColor = new Color(255, 255, 255, 200);
        g.circle(-r * 0.3, r * 0.3, r * 0.22);
        g.fill();
    }

    destroy() {
        this.alive = false;
        if (this.node && this.node.isValid) this.node.destroy();
    }
}
