import { Node, Graphics, Sprite, UITransform, Label, Color, Vec3, tween } from 'cc';
import { CFG } from '../config/GameConfig';
import { Assets } from '../config/Assets';

/**
 * Верхняя панель: счётчик ОЧКОВ + прогресс-бар до цели.
 * Прогресс-бар: если вставлен ассет заливки — FILLED-спрайт (тянется по прогрессу),
 * иначе Graphics-fallback. Строится кодом.
 */
export class Hud {
    root: Node;
    private scoreLabel: Label;
    private barW: number;
    private barY = 0;

    // fallback (Graphics)
    private barFill: Graphics | null = null;
    // asset-путь (Sprite FILLED)
    private fillSprite: Sprite | null = null;

    constructor(parent: Node, canvasW: number, canvasH: number) {
        this.root = new Node('Hud');
        parent.addChild(this.root);
        this.root.addComponent(UITransform);

        const topY = canvasH / 2 - 90;
        // ширина бара = ширина геймплейной зоны: края касаются боковых рамок (sideFrame)
        this.barW = canvasW - 2 * CFG.sideFrame;
        this.barY = topY - 100;

        // Счётчик очков
        const cn = new Node('score');
        this.root.addChild(cn);
        this.scoreLabel = cn.addComponent(Label);
        this.scoreLabel.string = '0';
        this.scoreLabel.fontSize = 72;
        this.scoreLabel.lineHeight = 72;
        this.scoreLabel.isBold = true;
        this.scoreLabel.color = new Color(255, 255, 255, 255);
        cn.setPosition(0, topY, 0);

        // Подпись
        const tn = new Node('label');
        this.root.addChild(tn);
        const tl = tn.addComponent(Label);
        tl.string = 'SCORE';
        tl.fontSize = 26;
        tl.lineHeight = 26;
        tl.isBold = true;
        tl.color = new Color(177, 75, 255, 255);
        tn.setPosition(0, topY - 52, 0);

        if (Assets.progressFill) this.buildBarSprites();
        else this.buildBarGraphics();
    }

    // ---------- Прогресс-бар из ассетов ----------

    private buildBarSprites() {
        const barH = 44;
        const fillPadX = 25;   // отступ заливки от краёв подложки слева/справа, px
        const fillTrimY = 10;  // заливка ниже подложки по вертикали (суммарно), px

        if (Assets.progressBg) {
            const bg = new Node('barBg');
            this.root.addChild(bg);
            const bu = bg.addComponent(UITransform);
            const sp = bg.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = Assets.progressBg;
            bu.setContentSize(this.barW, barH);
            bg.setPosition(0, this.barY, 0);
        }

        const fill = new Node('barFill');
        this.root.addChild(fill);
        const fu = fill.addComponent(UITransform);
        this.fillSprite = fill.addComponent(Sprite);
        // ВАЖНО: spriteFrame ПЕРВЫМ — иначе FILLED пересчитает UV по null и упадёт
        this.fillSprite.spriteFrame = Assets.progressFill;
        this.fillSprite.type = Sprite.Type.FILLED;           // заливается по fillRange
        this.fillSprite.fillType = Sprite.FillType.HORIZONTAL;
        this.fillSprite.fillStart = 0;
        this.fillSprite.fillRange = 0;
        this.fillSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        fu.setContentSize(this.barW - fillPadX * 2, barH - fillTrimY);   // уже по X, ниже по Y
        fill.setPosition(0, this.barY, 0);
    }

    // ---------- Прогресс-бар fallback (Graphics) ----------

    private buildBarGraphics() {
        const bg = new Node('barBg');
        this.root.addChild(bg);
        bg.addComponent(UITransform);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = new Color(255, 255, 255, 40);
        bgG.roundRect(-this.barW / 2, this.barY - 12, this.barW, 24, 12);
        bgG.fill();

        const fill = new Node('barFill');
        this.root.addChild(fill);
        fill.addComponent(UITransform);
        fill.setPosition(0, this.barY, 0);
        this.barFill = fill.addComponent(Graphics);
        this.drawBarGraphics(0);
    }

    private drawBarGraphics(t: number) {
        const g = this.barFill!;
        g.clear();
        const w = Math.max(0, Math.min(1, t)) * this.barW;
        if (w <= 0) return;
        g.fillColor = new Color(0, 240, 255, 90);       // свечение
        g.roundRect(-this.barW / 2 - 4, -16, w + 8, 32, 16);
        g.fill();
        g.fillColor = new Color(0, 240, 255, 255);      // тело
        g.roundRect(-this.barW / 2, -12, w, 24, 12);
        g.fill();
    }

    // ---------- API ----------

    /** Обновить прогресс по текущему счёту (0..1). */
    setProgress(score: number) {
        const t = Math.max(0, Math.min(1, score / CFG.targetScore));
        if (this.fillSprite) this.fillSprite.fillRange = t;
        else this.drawBarGraphics(t);
    }

    /** Обновить счётчик очков + bounce цифр. */
    setScore(score: number) {
        this.scoreLabel.string = `${score}`;
        const node = this.scoreLabel.node;
        node.setScale(1, 1, 1);
        tween(node)
            .to(0.08, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'quadOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();
    }
}
