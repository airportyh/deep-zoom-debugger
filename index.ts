import * as jsonr from "@airportyh/jsonr";
import { parse } from "play-lang/src/parser";
import { traverse } from "play-lang/src/traverser";
import { fitBox, Box, BoundingBox, TextBox, ContainerBox, TextMeasurer } from "./fit-box";

const CODE_LINE_HEIGHT = 42;
const CODE_FONT_SIZE = 36;
const CODE_FONT_FAMILY = "Monaco";

type StackFrame = {
    funName: string,
    parameters: { [paramName: string]: any },
    variables:  { [varName: string]: any }
};

type HistoryEntry = {
    line: number,
    stack: StackFrame[],
    heap: { [id: number]: any }
};

type Scope = {
    bbox: BoundingBox,
    historyEntries: HistoryEntry[]
};

async function main() {
    let dragging = false;
    let dragStartX: number;
    let dragStartY: number;
    const canvas = document.createElement("canvas");
    const log = document.createElement("pre");
    log.style.position = "absolute";
    log.style.bottom = "1px";

    canvas.width = 1200;
    canvas.height = 1200;
    canvas.style.border = "1px solid black";
    canvas.style.transform = `scale(0.5) translate(-${canvas.width / 2}px, -${canvas.height / 2}px)`;

    let viewport = {
        top: - canvas.height / 2,
        left: - canvas.width / 2,
        zoom: 0.5
    };
    
    let currentScopeChain: Scope[];
    
    const ctx = canvas.getContext("2d");

    document.body.appendChild(canvas);
    document.body.appendChild(log);
    
    const code = await fetchText("fib-recurse.play");
    const ast = parse(code);
    const historyText = await fetchText("fib-recurse.history");
    const history: HistoryEntry[] = jsonr.parse(historyText);
    ctx.textBaseline = "top";
    const textMeasurer = new TextMeasurer(ctx, true);
    
    currentScopeChain = [{
        bbox: {
            y: 0,
            x: 0,
            width: canvas.width,
            height: canvas.height
        },
        historyEntries: history
    }];

    requestRender();
    
    window.addEventListener("mousedown", (e: MouseEvent) => {
        dragging = true;
        [dragStartX, dragStartY] = pointScreenToCanvas(e);
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });

    window.addEventListener("mousemove", (e: MouseEvent) => {
        if (dragging) {
            const [pointerX, pointerY] = pointScreenToCanvas(e);
            const [worldPointerX, worldPointerY] = pointCanvasToWorld(pointerX, pointerY);
            const [worldDragStartX, worldDragStartY] = pointCanvasToWorld(dragStartX, dragStartY);
            viewport.left -= worldPointerX - worldDragStartX;
            viewport.top -= worldPointerY - worldDragStartY;
            dragStartX = pointerX;
            dragStartY = pointerY;
            requestRender();
        }
    });
    
    window.addEventListener("wheel", function (e: any) {
        e.preventDefault();
        const delta = e.deltaY;
        const [pointerX, pointerY] = pointScreenToCanvas(e);
        const newZoom = Math.max(0.5, viewport.zoom * (1 - delta * 0.01));

        const [worldPointerX, worldPointerY] = pointCanvasToWorld(pointerX, pointerY);
        const newLeft = - (pointerX / newZoom - worldPointerX);
        const newTop = - (pointerY / newZoom - worldPointerY);
        const newViewport = {
            top: newTop,
            left: newLeft,
            zoom: newZoom
        };
        viewport = newViewport;
        
        requestRender();
      }, { passive: false });

    function requestRender() {
        requestAnimationFrame(render);
    }
    
    // Assumes that one line can only contain one function call
    function renderScope(scope: Scope, ancestry: Scope[]): Scope[] {
        const entries = scope.historyEntries;
        const bbox = scope.bbox;
        const level = ancestry.length;
        const indent = Array(level + 1).join("  ");
        const myArea = bbox.width * bbox.height;
        const myAreaRatio = myArea / (canvas.width * canvas.height);
        const firstEntry = entries[0];
        const myScope: Scope = {
            bbox: boxCanvasToWorld(bbox),
            historyEntries: entries
        };
        
        ctx.clearRect(bbox.x, bbox.y, bbox.width, bbox.height);
        
        /*console.log(
            indent + "renderScope", 
            level,
            entries.length, 
            scopeId(myScope),
            //"bbox", bbox
        );*/
        
        const { currentEntries, childEntries } = groupHistoryEntries(entries);
        
        if (myAreaRatio < 0.5) {
            // not rendering children
            const stack = firstEntry.stack[firstEntry.stack.length - 1];
            const funName = stack.funName;
            const paramList = "(" + Object.values(stack.parameters).join(", ") + ")";
            const textBox: TextBox = {
                type: "text",
                text: funName + paramList
            };
            const bboxMap = fitBox(textBox, bbox, CODE_FONT_FAMILY, "normal", true, textMeasurer, ctx);
        } else {
            // rendering children
            const { codeBox, callExprTextBoxes } = getCodeBox(code, firstEntry, currentEntries);
            const bboxMap = fitBox(codeBox, bbox, CODE_FONT_FAMILY, "normal", true, textMeasurer, ctx);

            let foundChildEnclosingScope;
            const childAncestry = [myScope, ...ancestry];
            for (let callExprBox of callExprTextBoxes) {
                const { expr, box } = callExprBox;
                const childBBox = bboxMap.get(box);
                const frameEntries = childEntries[expr.start.line];
                if (frameEntries) {
                    const childEnclosingScope = renderScope(
                        { historyEntries: frameEntries, bbox: childBBox }, childAncestry);
                    if (childEnclosingScope) {
                        foundChildEnclosingScope = childEnclosingScope;
                    }
                }
            }
            
            if (foundChildEnclosingScope) {
                return foundChildEnclosingScope;
            }
        }
        
        if (entirelyContainsViewport(bbox)) {
            return [myScope, ...ancestry];
        } else {
            return null;
        }
    }
    
    function groupHistoryEntries(entries: HistoryEntry[]) {
        const currentStackHeight = entries[0].stack.length;
        const childEntries: { [line: number]: HistoryEntry[] } = {};
        const currentEntries = [];
        
        for (let entry of entries) {
            if (entry.stack.length === currentStackHeight) {
                currentEntries.push(entry);
            } else {
                const lastEntryThisFrame = currentEntries[currentEntries.length - 1];
                const lineNo = lastEntryThisFrame.line;
                if (!childEntries[lineNo]) {
                    childEntries[lineNo] = [];
                }
                childEntries[lineNo].push(entry);
            }
        }
        
        return {
            currentEntries,
            childEntries
        };
    }
    
    function getCodeBox(code: string, firstEntry, currentEntries: HistoryEntry[]) {
        // rendering children
        //console.log(indent + "myAreaRatio >= 0.5");
        const outerBox: Box = {
            type: "container",
            direction: "horizontal",
            children: []
        };
        const lineNumberBox: Box = {
            type: "container",
            direction: "vertical",
            children: []
        };
        outerBox.children.push(lineNumberBox);
        
        const codeBox: Box = {
            type: "container",
            direction: "vertical",
            children: []
        }
        outerBox.children.push(codeBox);
        
        
        const codeLines = code.split("\n");
        const callExprTextBoxes: Array<{ expr: any /* AST node */, box: Box }> = [];
        
        // Render first line of function definition
        const stack = firstEntry.stack[firstEntry.stack.length - 1];
        const funName = stack.funName;
        const funNode = findFunction(funName);
        const callExprs = findCallExpressions(funNode);
        const userDefinedFunctions = findFunctionDefinitions(ast);
        const userDefinedFunctionNames = userDefinedFunctions.map(fun => fun.name.value);
        const callExprsUser = callExprs.filter(expr => {
            return userDefinedFunctionNames.includes(expr.fun_name.value);
        });
        const lineNo = funNode.start.line;
        const line = codeLines[lineNo - 1];
        lineNumberBox.children.push({
            type: "text",
            text: String(lineNo)
        });
        const codeLine = codeLines[lineNo - 1];
        codeBox.children.push({
            type: "text",
            text: codeLine
        });
        
        // Finds and splits the call expressions in code lines
        for (let i = 0; i < currentEntries.length; i++) {
            let outputLine = "";
            const entry = currentEntries[i];
            const nextEntry = currentEntries[i + 1];
            const lineNo = entry.line;
            if (nextEntry && entry.line === nextEntry.line) {
                continue;
            }
            lineNumberBox.children.push({
                type: "text",
                text: String(lineNo)
            });
            
            const codeLine = codeLines[lineNo - 1];
            // TODO: handle multiple call exprs on same line
            const callExpr = callExprsUser.find(expr => {
                return expr.start.line === lineNo
            });
            if (callExpr) {
                const lineBox = splitCodeLine(codeLine, callExpr);
                callExprTextBoxes.push({
                    expr: callExpr,
                    box: lineBox.children[1]
                });
                codeBox.children.push(lineBox);
            } else {
                codeBox.children.push({
                    type: "text",
                    text: codeLine
                });
            }
        }
        return {
            codeBox: outerBox,
            callExprTextBoxes: callExprTextBoxes
        };
    }
    
    function splitCodeLine(codeLine: string, callExpr): ContainerBox {
        const firstChunk = codeLine.slice(0, callExpr.start.col);
        const secondChunk = codeLine.slice(callExpr.start.col, callExpr.end.col);
        const thirdChunk = codeLine.slice(callExpr.end.col);
        const callExprBox: TextBox = {
            type: "text",
            text: secondChunk
        };
        const lineBox: Box = {
            type: "container",
            direction: "horizontal",
            children: [
                {
                    type: "text",
                    text: firstChunk
                },
                callExprBox,
                {
                    type: "text",
                    text: thirdChunk
                }
            ]
        };
        return lineBox;
    }
    
    function entirelyContainsViewport(bbox) {
        return bbox.x <= 0 && bbox.y <= 0 &&
            (bbox.width - 1200 >= 0) && (bbox.height - 1200 >= 0);
    }
    
    function updateLog() {
        return;
        const width = canvas.width / viewport.zoom;
        const height = canvas.height / viewport.zoom;
        const box: BoundingBox = {
            y: 0,
            x: 0,
            width: canvas.width,
            height: canvas.height
        };
        const myBox = boxWorldToCanvas(box);
        const display = 
            `Left: ${viewport.left.toFixed(2)}, Top: ${viewport.top.toFixed(2)}, Zoom: ${viewport.zoom.toFixed(2)}, Width: ${width.toFixed(2)}, Height: ${height.toFixed(2)} <br>` +
            `World box: (X: ${myBox.x.toFixed(2)}, Y: ${myBox.y.toFixed(2)}, Width: ${myBox.width.toFixed(2)}, Height: ${myBox.height.toFixed(2)})`;
        
        log.innerHTML = display;
    }
    
    function render() {
        updateLog();
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const currentScope = currentScopeChain[0];
        const myBox = boxWorldToCanvas(currentScope.bbox);
        ctx.strokeRect(myBox.x, myBox.y, myBox.width, myBox.height);
        
        const enclosingScopeChain = renderScope({
            historyEntries: currentScope.historyEntries, 
            bbox: myBox
        }, currentScopeChain.slice(1));
        if (enclosingScopeChain) {
            currentScopeChain = enclosingScopeChain;
            //console.log("updating current scope to", currentScopeChain.map(scopeId).join(", "));
        } else {
            if (currentScopeChain.length > 1) {
                currentScopeChain = currentScopeChain.slice(1);
                //console.log("revert back to", currentScopeChain.map(scopeId).join(", "));
            } else {
                currentScopeChain = [{
                    bbox: {
                        y: 0,
                        x: 0,
                        width: canvas.width,
                        height: canvas.height
                    },
                    historyEntries: history
                }];
                //console.log("revert back to main");
            }
        }
        
    }
    
    function scopeId(scope: Scope): string {
        const stack = scope.historyEntries[0].stack;
        const stackFrame = stack[stack.length - 1];
        const id = stackFrame.funName + "(" + 
            Object.keys(stackFrame.parameters).map(key => `${key}=${stackFrame.parameters[key]}`).join(", ") +
        ")";
        return id;
    }
    
    function findLine(lineNo) {
        let found;
        traverse(ast, (node) => {
            if (node.start && node.start.line === lineNo) {
                found = node;
                return false;
            } else {
                return undefined;
            }
        });
        return found;
    }

    function findFunction(name) {
        let fun;
        traverse(ast, (node) => {
            if (node.type === "function_definition" && node.name.value === name) {
                fun = node;
            }
        });
        return fun;
    }
    
    function findCallExpressions(node) {
        let calls = [];
        traverse(node, (childNode) => {
            if (childNode.type === "call_expression") {
                calls.push(childNode);
            }
        });
        return calls;
    }
    
    function findFunctionDefinitions(node) {
        let defs = [];
        traverse(node, (childNode) => {
            if (childNode.type === "function_definition") {
                defs.push(childNode);
            }
        });
        return defs;
    }

    function getSource(node) {
        return code.slice(node.start.offset, node.end.offset);
    }
    
    function pointScreenToCanvas(e: MouseEvent): [number, number] {
        return [
            (e.clientX - canvas.offsetLeft - 1) * 2,
            (e.clientY - canvas.offsetTop - 1) * 2
        ];
    }
    
    function pointCanvasToWorld(x: number, y: number): [number, number] {
        return [
            x / viewport.zoom + viewport.left,
            y / viewport.zoom + viewport.top
        ];
    }

    function boxWorldToCanvas(box: BoundingBox): BoundingBox {
        return {
            y: (box.y - viewport.top) * viewport.zoom,
            x: (box.x - viewport.left) * viewport.zoom,
            width: box.width * viewport.zoom,
            height: box.height * viewport.zoom
        };
    }
    
    function boxCanvasToWorld(box: BoundingBox): BoundingBox {
        return {
            y: (box.y / viewport.zoom) + viewport.top,
            x: (box.x / viewport.zoom) + viewport.left,
            width: box.width / viewport.zoom,
            height: box.height / viewport.zoom
        };
    }
    
}



async function fetchText(filename) {
    const request = await fetch(filename);
    return request.text();
}

main().catch(err => console.log(err.stack));