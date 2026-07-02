import { Node, Graphics, UITransform, Label, Color, Vec3, tween } from 'cc';
import { CFG } from '../config/GameConfig';

/**
 * Верхняя панель: счётчик лопнутых + прогресс-бар до цели.
 * Строится кодом; ширина берётся из переданного размера канваса.
 */
export class Hud {
    root: Node;
    private countLabel: Label;
    private barFill: Graphics;
    private barW: number;
    private popped = 0;

    constructor(parent: Node, canvasW: number, canvasH: number) {
        this.root = new Node('Hud');
        parent.addChild(this.root);
        this.root.addComponent(UITransform);

        const topY = canvasH / 2 - 90;

        // Счётчик
        const cn = new Node('count');
        this.root.addChild(cn);
        this.countLabel = cn.addComponent(Label);
        this.countLabel.string = '0';
        this.countLabel.fontSize = 72;
        this.countLabel.lineHeight = 72;
        this.countLabel.isBold = true;
        this.countLabel.color = new Color(255, 255, 255, 255);
        cn.setPosition(0, topY, 0);

        // Подпись
        const tn = new Node('label');
        this.root.addChild(tn);
        const tl = tn.addComponent(Label);
        tl.string = 'POPPED';
        tl.fontSize = 26;
        tl.lineHeight = 26;
        tl.isBold = true;
        tl.color = new Color(177, 75, 255, 255);
        tn.setPosition(0, topY - 52, 0);

        // Прогресс-бар
        this.barW = canvasW - 120;
        const barY = topY - 100;

        const bg = new Node('barBg');
        this.root.addChild(bg);
        bg.addComponent(UITransform);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = new Color(255, 255, 255, 40);
        this.roundRect(bgG, -this.barW / 2, barY - 12, this.barW, 24, 12);
        bgG.fill();

        const fill = new Node('barFill');
        this.root.addChild(fill);
        fill.addComponent(UITransform);
        this.barFill = fill.addComponent(Graphics);
        this.drawBar(0);
        (fill as any)._barY = barY;
    }

    private roundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number) {
        g.roundRect(x, y, w, h, r);
    }

    private drawBar(t: number) {
        const g = this.barFill;
        g.clear();
        const w = Math.max(0, Math.min(1, t)) * this.barW;
        if (w <= 0) return;
        // неоновое свечение полосы
        g.fillColor = new Color(0, 240, 255, 90);
        g.roundRect(-this.barW / 2 - 4, -16, w + 8, 32, 16);
        g.fill();
        g.fillColor = new Color(0, 240, 255, 255);
        g.roundRect(-this.barW / 2, -12, w, 24, 12);
        g.fill();
    }

    /** Обновить прогресс по текущему счёту. */
    setProgress(score: number) {
        const barNode = this.barFill.node;
        const barY = (barNode as any)._barY as number;
        barNode.setPosition(0, barY, 0);
        this.drawBar(score / CFG.targetScore);
    }

    /** Прибавить к счётчику лопнутых + bounce цифр. */
    addPopped(n: number) {
        this.popped += n;
        this.countLabel.string = `${this.popped}`;
        const node = this.countLabel.node;
        node.setScale(1, 1, 1);
        tween(node)
            .to(0.08, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'quadOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();
    }
}
