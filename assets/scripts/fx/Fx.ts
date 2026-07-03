import {
    Node, Graphics, UITransform, UIOpacity, Label, Color, Vec3,
    ParticleSystem2D, instantiate, tween, math,
} from 'cc';
import { CFG } from '../config/GameConfig';
import { Assets } from '../config/Assets';

/**
 * Все «сочные» эффекты. Создают временные узлы на переданном fx-слое
 * и сами себя убирают по завершении твина.
 */
export class Fx {
    static layer: Node;

    static init(layer: Node) {
        Fx.layer = layer;
    }

    /**
     * Сплэш в точке лопания кластера.
     * Если вставлен префаб частиц — проигрываем его; иначе fallback:
     * Graphics-частицы + ударное кольцо.
     */
    static splash(x: number, y: number, color: Color, radius: number) {
        if (Assets.splashPrefab) {
            const n = instantiate(Assets.splashPrefab);
            Fx.layer.addChild(n);
            n.setPosition(x, y, 0);
            const ps = n.getComponent(ParticleSystem2D);
            if (ps) {
                ps.startColor = new Color(color.r, color.g, color.b, 255);
                ps.endColor = new Color(color.r, color.g, color.b, 0);
                ps.resetSystem();
            }
            // авто-очистка (с запасом под долгую Life частиц)
            tween(n).delay(2.5).call(() => n.isValid && n.destroy()).start();
        } else {
            Fx.burst(x, y, color, 14);
            Fx.shockwave(x, y, color, radius);
        }
    }

    /** Взрыв частиц в точке (осколки кластера). */
    static burst(x: number, y: number, color: Color, count = 18) {
        for (let i = 0; i < count; i++) {
            const n = new Node('p');
            Fx.layer.addChild(n);
            n.addComponent(UITransform);
            const g = n.addComponent(Graphics);
            const rad = math.randomRange(4, 9);
            g.fillColor = color;
            g.circle(0, 0, rad);
            g.fill();
            n.setPosition(x, y, 0);

            const op = n.addComponent(UIOpacity);
            const ang = math.randomRange(0, Math.PI * 2);
            const dist = math.randomRange(50, 180);
            const tx = x + Math.cos(ang) * dist;
            const ty = y + Math.sin(ang) * dist;
            const dur = math.randomRange(0.35, 0.6);

            tween(n)
                .to(dur, { position: new Vec3(tx, ty, 0), scale: new Vec3(0.2, 0.2, 0.2) },
                    { easing: 'quadOut' })
                .call(() => n.isValid && n.destroy())
                .start();
            tween(op).delay(dur * 0.4).to(dur * 0.6, { opacity: 0 }).start();
        }
    }

    /** Расходящееся ударное кольцо. */
    static shockwave(x: number, y: number, color: Color, radius: number) {
        const n = new Node('ring');
        Fx.layer.addChild(n);
        n.addComponent(UITransform);
        const g = n.addComponent(Graphics);
        g.lineWidth = 8;
        g.strokeColor = new Color(color.r, color.g, color.b, 255);
        g.circle(0, 0, radius);
        g.stroke();
        n.setPosition(x, y, 0);
        n.setScale(0.3, 0.3, 1);

        const op = n.addComponent(UIOpacity);
        tween(n).to(CFG.shockwaveGrow, { scale: new Vec3(2.2, 2.2, 1) }, { easing: 'quadOut' }).start();
        tween(op).to(CFG.shockwaveGrow, { opacity: 0 })
            .call(() => n.isValid && n.destroy()).start();
    }

    /** Всплывающий текст очков / комбо. */
    static popup(x: number, y: number, text: string, color: Color, big = false) {
        const n = new Node('popup');
        Fx.layer.addChild(n);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = big ? 64 : 44;
        lbl.lineHeight = lbl.fontSize;
        lbl.isBold = true;
        lbl.color = color;
        n.setPosition(x, y, 0);
        n.setScale(0.5, 0.5, 1);

        const op = n.addComponent(UIOpacity);
        tween(n)
            .to(0.14, { scale: new Vec3(1.25, 1.25, 1) }, { easing: 'backOut' })
            .to(0.11, { scale: new Vec3(1, 1, 1) })
            .start();
        tween(n).to(CFG.popupTime, { position: new Vec3(x, y + CFG.popupRise, 0) },
            { easing: 'quadOut' }).start();
        tween(op).delay(CFG.popupTime * 0.5).to(CFG.popupTime * 0.5, { opacity: 0 })
            .call(() => n.isValid && n.destroy()).start();
    }

    /** Короткая белая вспышка в точке контакта (bloom). */
    static flash(x: number, y: number, radius: number) {
        const n = new Node('flash');
        Fx.layer.addChild(n);
        n.addComponent(UITransform);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(255, 255, 255, 220);
        g.circle(0, 0, radius);
        g.fill();
        n.setPosition(x, y, 0);
        const op = n.addComponent(UIOpacity);
        tween(n).to(0.2, { scale: new Vec3(1.8, 1.8, 1) }, { easing: 'quadOut' }).start();
        tween(op).to(0.2, { opacity: 0 }).call(() => n.isValid && n.destroy()).start();
    }
}
