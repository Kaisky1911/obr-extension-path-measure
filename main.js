

import OBR, { buildLabel, buildPath, Command } from "@owlbear-rodeo/sdk";

const ID = "path-measure-tool";

let interaction = null;
let allMyItems = [];
let dragStartPos = null
let lastGridPos = null
let cleanupActionIsAdded = false;

async function snapToGrid(pos) {
    return await OBR.scene.grid.snapPosition(pos, true, false)
}


function createTool() {
    OBR.tool.create({
        id: `${ID}/tool`,
        icons: [
            {
                icon: "/icon.svg",
                label: "Measure a Path",
            },
        ],
    });
}

function addCleanupAction() {
    if (cleanupActionIsAdded) {
        return;
    }
    OBR.tool.createAction({
        id: `${ID}/delete`,
        icons: [
            {
                icon: "/delete.svg",
                label: "Clean up",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onClick(_, elementId) {
            allMyItems.forEach(([label, path]) => {
                OBR.scene.items.deleteItems([label.id, path.id]);
            });
            allMyItems = [];
            OBR.tool.removeAction(`${ID}/delete`);
            cleanupActionIsAdded = false;
        },
    });
    cleanupActionIsAdded = true;
}

function createMode() {
    OBR.tool.createMode({
        id: `${ID}/move`,
        icons: [
            {
                icon: "/move.svg",
                label: "Move",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onToolDragStart,
        onToolDragMove,
        onToolDragEnd,
        onToolDragCancel,
    });
    OBR.tool.createMode({
        id: `${ID}/measure`,
        icons: [
            {
                icon: "/measure.svg",
                label: "Measure",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onToolDragStart,
        onToolDragMove,
        onToolDragEnd,
        onToolDragCancel,
    });
    OBR.tool.createMode({
        id: `${ID}/draw`,
        icons: [
            {
                icon: "/draw.svg",
                label: "Draw",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onToolDragStart,
        onToolDragMove,
        onToolDragEnd,
        onToolDragCancel,
    });
}

async function onToolDragStart(context, event) {
    let strokeColor = await OBR.player.getColor();
    let startPos = await snapToGrid(event.pointerPosition);
    dragStartPos = startPos
    let dragItem = null
    if (context.activeMode === `${ID}/move`) {
        if (event.target && event.target.layer === "CHARACTER") {
            dragItem = event.target;
        }
    }
    const path = buildPath()
        .commands([[Command.MOVE, startPos.x, startPos.y]])
        .fillColor("transparent")
        .strokeColor(strokeColor)
        .strokeWidth(30)
        .strokeOpacity(0.5)
        .strokeDash([30, 10])
        .locked(true)
        .layer("DRAWING")
        .build();
    const label = buildLabel()
        .plainText(`0${(await OBR.scene.grid.getScale()).parsed.unit}`)
        .position(startPos)
        .layer("NOTE")
        .build();
    let items = [label, path]
    if (dragItem) {
        items.push(dragItem);
    }
    interaction = await OBR.interaction.startItemInteraction(items);
}
async function onToolDragMove(context, event) {
    if (interaction) {
        const [update] = interaction;
        let newPos = await snapToGrid(event.pointerPosition);
        if (newPos.x === lastGridPos?.x && newPos.y === lastGridPos?.y) {
            return;
        }
        lastGridPos = newPos
        let scale = (await OBR.scene.grid.getScale()).parsed.unit
        let gridType = await OBR.scene.grid.getType()
        let gridDpi = await OBR.scene.grid.getDpi()
        let scale_multiplier = (await OBR.scene.grid.getScale()).parsed.multiplier
        update(([label, path, dragItem]) => {
            let lastCommand = path.commands[path.commands.length - 1];
            let lastLastCommand = path.commands[path.commands.length - 2];
            if (lastCommand) {
                if (Math.sqrt(Math.pow(newPos.x - lastCommand[1], 2) + Math.pow(newPos.y - lastCommand[2], 2)) < gridDpi / 2) {
                    return;
                }
            }
            if (lastLastCommand && Math.sqrt(Math.pow(newPos.x - lastLastCommand[1], 2) + Math.pow(newPos.y - lastLastCommand[2], 2)) < gridDpi / 2) {
                path.commands.pop();
            }
            else {
                while (Math.sqrt(Math.pow(newPos.x - lastCommand[1], 2) + Math.pow(newPos.y - lastCommand[2], 2)) > gridDpi * 1.1) {
                    if (gridType == "SQUARE") {
                        let x_dis = newPos.x - lastCommand[1];
                        let y_dis = newPos.y - lastCommand[2];
                        let dx = 0;
                        let dy = 0;
                        if (Math.abs(x_dis) > Math.abs(y_dis)) {
                            dx = Math.sign(x_dis) * gridDpi;
                        }
                        else {
                            dy = Math.sign(y_dis) * gridDpi;
                        }
                        path.commands.push([Command.LINE, lastCommand[1] + dx, lastCommand[2] + dy])
                    }
                    else {
                        let angle = Math.atan2(newPos.y - lastCommand[2], newPos.x - lastCommand[1]);
                        let angle_offset = 0
                        if (gridType == "HEX_HORIZONTAL") {
                            angle_offset = Math.PI / 6
                        }
                        angle = Math.round((angle + angle_offset) / (Math.PI / 3)) * (Math.PI / 3) - angle_offset;
                        let dx = Math.cos(angle) * gridDpi;
                        let dy = Math.sin(angle) * gridDpi;
                        path.commands.push([Command.LINE, lastCommand[1] + dx, lastCommand[2] + dy])
                    }
                    lastCommand = path.commands[path.commands.length - 1];
                }
                path.commands.push([Command.LINE, newPos.x, newPos.y])
            }
            if (dragItem) {
                dragItem.position = newPos;
            }
            label.position = newPos;
            label.text.plainText = `${scale_multiplier * (path.commands.length - 1)}${scale}`;
        });
    }
}

async function onToolDragEnd(context, event) {
    if (interaction) {
        const [update, stop] = interaction;
        let newPos = await snapToGrid(event.pointerPosition);
        let [label, path, dragItem] = update(([label, path, dragItem]) => {
            if (dragItem) {
                OBR.scene.items.updateItems([dragItem], (items) => {
                    for (let item of items) {
                        item.position = newPos;
                    }
                })
            }
        });
        if (context.activeMode === `${ID}/draw`) {
            OBR.scene.items.addItems([label, path]);
            allMyItems.push([label, path]);
            addCleanupAction();
        }
        stop();
    }
    interaction = null;
}

function onToolDragCancel() {
    if (interaction) {
        const [update, stop] = interaction;
        let [label, path, dragItem] = update(([label, path, dragItem]) => {
            if (dragItem) {
                dragItem.position = dragStartPos
            }
        });
        stop();
    }
    interaction = null;
}



OBR.onReady(async () => {
    createTool();
    createMode();
});

