

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

const DIAGONAL_MODES = ["disabled", "diagonal", "1.5", "alternating"]
let diagonalMode = 0

function createDiagonalModeAction() {
    OBR.tool.createAction({
        id: `${ID}/diagonal-mode-${DIAGONAL_MODES[diagonalMode]}`,
        icons: [
            {
                icon: `/diagonal-mode-${DIAGONAL_MODES[diagonalMode]}.svg`,
                label: "Diagonal Measure Type: " + DIAGONAL_MODES[diagonalMode],
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onClick(_, elementId) {
            OBR.tool.removeAction(`${ID}/diagonal-mode-${DIAGONAL_MODES[diagonalMode]}`);
            diagonalMode = (diagonalMode + 1) % DIAGONAL_MODES.length
            createDiagonalModeAction();
        },
    });
}

function createModes() {
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
        .layer("MOUNT")
        .build();
    const label = buildLabel()
        .plainText(`0${(await OBR.scene.grid.getScale()).parsed.unit}`)
        .position(startPos)
        .layer("NOTE")
        .build();
    let items = [label, path]
    if (dragItem) {
        let attachements = await OBR.scene.items.getItemAttachments([dragItem.id])
        items = items.concat(attachements);
    }
    interaction = await OBR.interaction.startItemInteraction(items);
}

async function onToolDragMove(context, event) {
    if (interaction) {
        const [update] = interaction;
        let newPos = await snapToGrid(event.pointerPosition);
        if (diagonalMode && getDis(newPos, event.pointerPosition) > 0.5 * (await OBR.scene.grid.getDpi())) {
            return;
        }
        if (newPos.x === lastGridPos?.x && newPos.y === lastGridPos?.y) {
            return;
        }
        lastGridPos = newPos
        let scale = (await OBR.scene.grid.getScale()).parsed.unit
        let gridType = await OBR.scene.grid.getType()
        let gridDpi = await OBR.scene.grid.getDpi()
        let scale_multiplier = (await OBR.scene.grid.getScale()).parsed.multiplier
        update((items) => {
            let label = items[0]
            let path = items[1]
            let dragItem = null
            let attachements = null
            if (items.length > 2) {
                dragItem = items[2]
                attachements = items.slice(3)
            }
            let lastCommand = path.commands[path.commands.length - 1];
            let lastLastCommand = path.commands[path.commands.length - 2];
            if (lastCommand) {
                if (getDis(newPos, { x: lastCommand[1], y: lastCommand[2]}) < gridDpi / 2) {
                    return;
                }
            }
            if (lastLastCommand && getDis(newPos, { x: lastLastCommand[1], y: lastLastCommand[2]}) < gridDpi / 2) {
                path.commands.pop();
            }
            else {
                while (getDis(newPos, { x: lastCommand[1], y: lastCommand[2]}) > gridDpi * 1.1) {
                    if (gridType == "SQUARE") {
                        let x_dis = newPos.x - lastCommand[1];
                        let y_dis = newPos.y - lastCommand[2];
                        let dx = Math.sign(x_dis) * gridDpi;
                        let dy = Math.sign(y_dis) * gridDpi;
                        if (!diagonalMode) {
                            if (Math.abs(x_dis) > Math.abs(y_dis)) {
                                dy = 0
                            }
                            else {
                                dx = 0
                            }
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
                if (getDis(newPos, { x: lastCommand[1], y: lastCommand[2]}) > gridDpi / 2) {
                    path.commands.push([Command.LINE, newPos.x, newPos.y])
                }
            }
            if (dragItem) {
                for (let attachment of attachements) {
                    let rel_x = attachment.position.x - dragItem.position.x
                    let rel_y = attachment.position.y - dragItem.position.y
                    attachment.position = { x: newPos.x + rel_x, y: newPos.y + rel_y }
                }
                dragItem.position = newPos;
            }
            label.position = newPos;
            let distance = 0
            let diagonalMovesCount = 0
            for (let command of path.commands) {
                if (command[0] == Command.LINE) {
                    let dis = getDis({ x: command[1], y: command[2] }, { x: lastCommand[1], y: lastCommand[2] })
                    let diagonal = dis > gridDpi * 1.1
                    if (!diagonal) {
                        distance +=1;
                    }
                    else {
                        if (diagonalMode == 2) {
                            distance += 1.5;
                        }
                        else if (diagonalMode == 3) {
                            distance += 1 + (diagonalMovesCount % 2);
                            diagonalMovesCount += 1;
                        }
                        else {
                            distance += 1;
                        }
                    }
                }
                lastCommand = command
            }
            label.text.plainText = `${scale_multiplier * distance}${scale}`;
        });
    }
}

function getDis(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
}

async function onToolDragEnd(context, event) {
    if (interaction) {
        const [update, stop] = interaction;
        let newPos = await snapToGrid(event.pointerPosition);
        let items = update((items) => {
            if (items.length > 2) {
                let dragItem = items[2]
                let attachements = items.slice(3)
                OBR.scene.items.updateItems(([dragItem].concat(attachements)), (items) => {
                    let dragItem = items[0]
                    let attachements = items.slice(1)
                    dragItem.position = newPos
                    for (let attachement of attachements) {
                        attachement.position = { x: attachement.position.x, y: attachement.position.y }
                    }
                })
            }
        });
        if (context.activeMode === `${ID}/draw`) {
            let label = items[0]
            let path = items[1]
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
    createModes();
    createDiagonalModeAction();
});

