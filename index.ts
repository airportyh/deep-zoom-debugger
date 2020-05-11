import * as jsonr from "@airportyh/jsonr";
import { parse } from "play-lang/src/parser";
import { traverse } from "play-lang/src/traverser";
import { fitBox, Box, BoundingBox, TextBox, ContainerBox, TextMeasurer } from "./fit-box";

const CODE_LINE_HEIGHT = 1.5;
const CODE_FONT_SIZE = 36;
const CODE_FONT_FAMILY = "Monaco";
const LINE_NUMBER_COLOR = "#489dff";
const CODE_COLOR = "black";
const VARIABLE_DISPLAY_COLOR = "#f0b155";
const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1200;

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

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
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
        const stackFrame = firstEntry.stack[firstEntry.stack.length - 1];
        const funName = stackFrame.funName;
        const funNode = findFunction(funName);
        const userDefinedFunctions = findNodesOfType(ast, "function_definition");
        const userDefinedFunctionNames = userDefinedFunctions.map(fun => fun.name.value);
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
        
        const { currentEntries, childEntries } = groupHistoryEntries(funNode, entries, userDefinedFunctionNames);
        
        if (myAreaRatio < 0.4) {
            // not rendering children
            const stack = firstEntry.stack[firstEntry.stack.length - 1];
            const funName = stack.funName;
            const paramList = "(" + Object.values(stack.parameters).join(", ") + ")";
            const textBox: TextBox = {
                type: "text",
                text: funName + paramList
            };
            fitBox(textBox, bbox, CODE_FONT_FAMILY, "normal", true, textMeasurer, CODE_LINE_HEIGHT, ctx);
        } else {
            // rendering children
            const { codeBox, callExprTextBoxes } = getCodeBox(code, currentEntries, childEntries, userDefinedFunctionNames);
            const bboxMap = fitBox(codeBox, bbox, CODE_FONT_FAMILY, "normal", true, textMeasurer, CODE_LINE_HEIGHT, ctx);

            let foundChildEnclosingScope;
            const childAncestry = [myScope, ...ancestry];
            for (let callExprBox of callExprTextBoxes) {
                const { expr, box } = callExprBox;
                const childBBox = bboxMap.get(box);
                const frameEntries = childEntries.get(expr);
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
    
    function groupHistoryEntries(funNode, entries: HistoryEntry[], userDefinedFunctionNames: string[]) {
        const currentStackHeight = entries[0].stack.length;
        const childEntries: Map<any, HistoryEntry[]> = new Map();
        const currentEntries = [];
        
        let currentLine: number = null;
        let callExprs: any[] = null;
        let currentCallExprIdx = null;
        for (let entry of entries) {
            if (entry.stack.length === currentStackHeight) {
                if (currentLine !== entry.line) {
                    currentLine = entry.line;
                    // initialize context for this line
                    currentEntries.push(entry);
                    // find call expressions on this line
                    callExprs = findNodesOfTypeOnLine(funNode, "call_expression", entry.line)
                        .filter(expr => userDefinedFunctionNames.includes(expr.fun_name.value));
                    currentCallExprIdx = 0;
                } else { // currentLine === entry.line
                    currentCallExprIdx++;
                }
            } else {
                // nested scope execution
                const callExpr = callExprs[currentCallExprIdx];
                if (!childEntries.has(callExpr)) {
                    childEntries.set(callExpr, []);
                }
                childEntries.get(callExpr).push(entry);
            }
        }
        
        return {
            currentEntries,
            childEntries
        };
    }
    
    function getCodeBox(code: string, currentEntries: HistoryEntry[], childEntries: Map<any, HistoryEntry[]>, userDefinedFunctionNames: string[]) {
        // rendering children
        //console.log(indent + "myAreaRatio >= 0.5");
        const codeLines = code.split("\n");
        const firstEntry = currentEntries[0];
        const stackFrame = firstEntry.stack[firstEntry.stack.length - 1];
        const funName = stackFrame.funName;
        const funNode = findFunction(funName);
        const lineNumberWidth = 3;
        
        const outerBox: Box = {
            type: "container",
            direction: "vertical",
            children: []
        };
        const callExprTextBoxes: Array<{ expr: any, box: TextBox }> = [];
        
        // layout the function signature
        const funSigBox: ContainerBox = {
            type: "container",
            direction: "horizontal",
            children: [
                {
                    type: "text",
                    text: String(funNode.start.line).padEnd(lineNumberWidth) + "  ",
                    color: LINE_NUMBER_COLOR
                },
                {
                    type: "text",
                    text: codeLines[funNode.start.line - 1],
                    color: CODE_COLOR
                }
            ]
        };
        for (let param of funNode.parameters) {
            const paramName = param.value;
            const value = stackFrame.variables[paramName];
            funSigBox.children.push({
                type: "text",
                text: `  ${paramName} = ${value}`,
                color: VARIABLE_DISPLAY_COLOR
            });
        }
        
        outerBox.children.push(funSigBox);
        
        // Go through current entries and layout the code line by line
        for (let i = 0; i < currentEntries.length; i++) {
            let outputLine = "";
            const entry = currentEntries[i];
            const nextEntry = currentEntries[i + 1];
            if (nextEntry && entry.line === nextEntry.line) {
                continue;
            }
            const line = codeLines[entry.line - 1];
            const lineNumberBox: TextBox = {
                type: "text",
                text: String(entry.line).padEnd(lineNumberWidth) + "  ",
                color: LINE_NUMBER_COLOR
            };
            const lineBox: ContainerBox = {
                type: "container",
                direction: "horizontal",
                children: [
                    lineNumberBox
                ]
            };
            
            // See if there are callExpr nodes
            let curpos: number = 0;
            const callExprNodes = findNodesOfTypeOnLine(funNode, "call_expression", entry.line);
            for (let callExprNode of callExprNodes) {
                if (!userDefinedFunctionNames.includes(callExprNode.fun_name.value)) {
                    continue;
                }
                const startIdx = callExprNode.start.col;
                const endIdx = callExprNode.end.col;
                const previousCode = line.slice(curpos, startIdx);
                lineBox.children.push({
                    type: "text",
                    text: previousCode,
                    color: CODE_COLOR
                });
                const callExprCode = line.slice(startIdx, endIdx);
                const callExprTextBox: TextBox = {
                    type: "text",
                    text: callExprCode,
                    color: CODE_COLOR
                };
                callExprTextBoxes.push({
                    expr: callExprNode,
                    box: callExprTextBox
                });
                lineBox.children.push(callExprTextBox);
                curpos = endIdx;
            }
            // wrap up
            const rest = line.slice(curpos);
            if (rest.length > 0) {
                lineBox.children.push({
                    type: "text",
                    text: rest,
                    color: CODE_COLOR
                });
            }
            
            const valueDisplayStrings: string[] = [];
            for (let callExprNode of callExprNodes) {
                const startIdx = callExprNode.start.col;
                const endIdx = callExprNode.end.col;
                const callExprCode = line.slice(startIdx, endIdx);
                const myChildEntries = childEntries.get(callExprNode);
                if (!myChildEntries) {
                    continue;
                }
                const lastChildEntry = myChildEntries[myChildEntries.length - 1];
                const lastChildEntryStackFrame = lastChildEntry.stack[lastChildEntry.stack.length - 1];
                const retVal = lastChildEntryStackFrame.variables["<ret val>"];
                valueDisplayStrings.push(`${callExprCode} = ${retVal}`);
            }
            
            // Display variable values for assignments
            const assignmentNode = findNodesOfTypeOnLine(funNode, "var_assignment", entry.line)[0];
            if (assignmentNode) {
                const varName = assignmentNode.var_name.value;
                const nextStackFrame = nextEntry.stack[nextEntry.stack.length - 1];
                const varValue = nextStackFrame.variables[varName];
                valueDisplayStrings.push(`${varName} = ${varValue}`);
            }
            
            // Display variable values for return statements
            const returnStatement = findNodesOfTypeOnLine(funNode, "return_statement", entry.line)[0];
            if (returnStatement) {
                const nextStackFrame = nextEntry.stack[nextEntry.stack.length - 1];
                const varValue = nextStackFrame.variables["<ret val>"];
                valueDisplayStrings.push(`<ret val> = ${varValue}`);
            }
            
            outerBox.children.push(lineBox);
            
            if (valueDisplayStrings.length > 0) {
                lineBox.children.push({
                    type: "text",
                    text: "  " + valueDisplayStrings[0],
                    color: VARIABLE_DISPLAY_COLOR
                });
                for (let i = 1; i < valueDisplayStrings.length; i++) {
                    outerBox.children.push({
                        type: "text",
                        text: "".padStart(lineNumberWidth + line.length + 4) + valueDisplayStrings[i],
                        color: VARIABLE_DISPLAY_COLOR
                    });
                }
            }
            
        }
        
        return {
            codeBox: outerBox,
            callExprTextBoxes: callExprTextBoxes
        };
    }
    
    function entirelyContainsViewport(bbox) {
        return bbox.x <= 0 && bbox.y <= 0 &&
            (bbox.width - CANVAS_WIDTH >= 0) && (bbox.height - CANVAS_HEIGHT >= 0);
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
    
    function findNodesOfType(node, type) {
        let defs = [];
        traverse(node, (childNode) => {
            if (childNode.type === type) {
                defs.push(childNode);
            }
        });
        return defs;
    }
    
    function findNodesOfTypeOnLine(node, type, lineNo) {
        let defs = [];
        traverse(node, (childNode) => {
            if (childNode.type === type && childNode.start.line === lineNo) {
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