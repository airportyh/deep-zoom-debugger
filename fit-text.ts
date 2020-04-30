export type BoundingBox = {
    top: number;
    left: number;
    width: number;
    height: number;
};

export type FontSetting = {
    size: number,
    family: string,
    weight: string
};

export class TextMeasurer {
    widthTable: { [key: string]: number } = {};
    ctx: CanvasRenderingContext2D;
    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx;
    }

    measureText(text: string, fontSetting: FontSetting): number {
        const fontString = `${fontSetting.weight} ${fontSetting.size}px ${fontSetting.family}`;
        let totalWidth = 0;
        for (let chr of text) {
            const chrKey = chr + fontString;
            let width = this.widthTable[chrKey];
            if (!width) {
                this.ctx.font = fontString;
                width = this.ctx.measureText(chr).width;
                this.widthTable[chrKey] = width;
            }
            totalWidth += width;
        }
        return totalWidth;
    }
}

export function fitText(
    ctx: CanvasRenderingContext2D, 
    text: string, 
    fontFamily: string,
    fontWeight: string = "normal",
    box: BoundingBox,
    textMeasurer: TextMeasurer,
    lineHeight: number = 1.2
) {
    let lowerFontSize: null | number = null;
    let upperFontSize: null | number = null;
    let fontSize = 5;
    let lines = text.split("\n");
    let height: number, width: number;
    ctx.strokeRect(box.left, box.top, box.width, box.height);
    // console.log("fitText", text);
    while (true) {
        height = lines.length * fontSize * lineHeight;
        width = lines.reduce((widest, line) => {
            const lineWidth = textMeasurer.measureText(line, {
                size: fontSize,
                weight: fontWeight,
                family: fontFamily
            });
            if (widest > lineWidth) {
                return widest;
            } else {
                return lineWidth;
            }
        }, 0);
        // console.log("try font size", fontSize, "height", height, "width", width);
        
        const allFit = height <= box.height && width <= box.width;
        if (allFit) {
            lowerFontSize = fontSize;
            if (upperFontSize) {
                const newFontSize = Math.floor((upperFontSize + fontSize) / 2);
                if (newFontSize === fontSize) {
                    break;
                }
                fontSize = newFontSize;
            } else {
                fontSize *= 2;
            }
        } else {
            upperFontSize = fontSize;
            if (lowerFontSize) {
                const newFontSize = Math.floor((lowerFontSize + fontSize) / 2);
                if (newFontSize === fontSize) {
                    break;
                }
                fontSize = newFontSize;
            } else {
                fontSize = Math.floor(fontSize / 2);
            }
        }
    }
    // console.log("result font size", fontSize);
    ctx.fillStyle = "black";
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const topOffset = (box.height - lines.length * fontSize * lineHeight) / 2;
    const leftOffset = (box.width - width) / 2;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        ctx.fillText(line, 
            leftOffset + box.left, 
            topOffset + box.top + (i + 1) * (lineHeight * fontSize)
        );
    }
}