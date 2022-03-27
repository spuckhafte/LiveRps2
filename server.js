const http = require('http').createServer();
const io = require('socket.io')(http, {
    cors: { origin: '*' }
});
const port = process.env.PORT || 1729;

// 1 -> engaged room
// 0 -> free room
// -1 -> room is being created

// { roomNo1: { status: '1', players: [id1, id2] }, roomNo2: { status: '0', players: [id1] } }
let rooms = {};

// { roomNo1: [[socketid, response], [socketid, response]] }
let afterResponse = {};

let retryPlayers = {};

io.on('connection', socket => {
    console.log('a user connected');

    socket.on('join', _name => {
        join(socket, _name, socket.id);
    })

    socket.on('ready', async () => {
        let roomNo = await findRoomNo(socket);
        let room = rooms[roomNo];
        io.to(roomNo).emit('block-btns');
        await sleep(1500);
        io.to(roomNo).emit('reset');
        await sleep(1000);
        startGame(roomNo, room);
    })

    socket.on('select', async rps => {
        let kaamHoGaya = false;
        let donoKaHoGaya = false; // donoKaHoGaya means that both players have made their choice
        let roomNo = await findRoomNo(socket);
        if (!Object.keys(afterResponse).includes(roomNo)) {
            if (rps !== 'none') {
                afterResponse[roomNo] = [];
                afterResponse[roomNo].push([socket.id, rps]);
            } else afterResponse[roomNo] = [];
        } else {
            kaamHoGaya = true;
            if (rps !== 'none') {
                if (afterResponse[roomNo].length === 1) {
                    donoKaHoGaya = true;
                    afterResponse[roomNo].push([socket.id, rps]);
                } else io.to(roomNo).emit('no-response');
            } else io.to(roomNo).emit('no-response');
        }

        if (donoKaHoGaya) decideWinner(roomNo);
        if (kaamHoGaya) delete afterResponse[roomNo];
    });

    socket.on('leave-room', async () => {
        await splitRoom(socket, socket.id);
    })

    socket.on('retry', async (result, partner) => {
        if (partner !== 'finding rival...') {
            if (result === '' || result === undefined || result === null) socket.emit('rematch')
            await retry(socket, socket.id);
        } else console.log('finding rival...');
    })

    socket.on('disconnect', async () => {
        console.log('a user disconnected');
        let roomNo = await leaveRoom(socket, socket.id);
        if (roomNo !== undefined) mergeRooms(roomNo);

    });

    // socket.on('rps')

})

async function join(socket, name, id) {
    let roomNo = await findEmptyRoom();
    let room = rooms[roomNo];
    if (room.status === '-1') {
        room.status = '0';
        room.players.push(`${name}-${id}`)
        socket.join(roomNo);

        io.to(roomNo).emit('joined', JSON.stringify(room));
        // console.log(rooms)
    } else {
        room.status = '1';
        room.players.push(`${name}-${id}`)
        socket.join(roomNo);

        io.to(roomNo).emit('joined', JSON.stringify(room));
        // console.log(rooms)
    }
}

async function findEmptyRoom(query) {
    if (query === 'force') {
        let roomNo;
        if (Object.keys(rooms).length === 0) roomNo = 1;
        else roomNo = parseInt(Object.keys(rooms)[Object.keys(rooms).length - 1]) + 1;
        rooms[roomNo] = { status: '-1', players: [] };
        return roomNo.toString();
    }
    let roomFound = false;
    for (let roomNo in Object.keys(rooms)) {
        roomNo = Object.keys(rooms)[roomNo];
        if (rooms[roomNo.toString()].status === '0') {
            roomFound = true;
            return roomNo;
        }
    }
    if (!roomFound) {
        let roomNo;
        if (Object.keys(rooms).length === 0) roomNo = 1;
        else roomNo = parseInt(Object.keys(rooms)[Object.keys(rooms).length - 1]) + 1;
        rooms[roomNo] = { status: '-1', players: [] };
        return roomNo.toString();
    }
}


async function leaveRoom(socket, id) {
    let roomNo = await findRoomNo(socket);
    let room = rooms[roomNo];
    let player = room.players.find(player => player.includes(id));
    room.players.splice(room.players.indexOf(player), 1);
    io.to(roomNo).emit('reset', 'score', 'btns');
    delete retryPlayers[roomNo];
    socket.leave(roomNo);
    if (room.players.length === 1) {
        room.status = '0';
        io.to(roomNo).emit('left', JSON.stringify(room));
        // console.log(rooms)
        return roomNo;
    }
    else delete rooms[roomNo];
    // console.log(rooms)
}

async function splitRoom(socket, id) {
    let oldRoomNo = await findRoomNo(socket);
    let player = rooms[oldRoomNo].players.find(player => player.includes(id));
    await leaveRoom(socket, id);
    let newRoom = await findEmptyRoom('force');
    socket.join(newRoom);
    socket.emit('empty-new-room')
    rooms[newRoom] = { status: '0', players: [player] };
    // console.log(rooms);
    if (rooms[oldRoomNo] !== undefined && rooms[oldRoomNo].status === '0') await mergeRooms(oldRoomNo);
}


async function mergeRooms(roomNo) {
    for (let roomNo2 in Object.keys(rooms)) {
        try {
            roomNo = roomNo.toString();
            roomNo2 = Object.keys(rooms)[roomNo2];
            if (roomNo2 !== roomNo && rooms[roomNo2].status === '0') {
                rooms[roomNo].players = rooms[roomNo].players.concat(rooms[roomNo2].players);
                rooms[roomNo].status = '1';
                const secondSocket = io.sockets.sockets.get(rooms[roomNo2].players[0].split('-')[1]);
                secondSocket.leave(roomNo2);
                secondSocket.join(roomNo);
                delete rooms[roomNo2];

                io.to(roomNo).emit('joined', JSON.stringify(rooms[roomNo]));
                // console.log(rooms)
                return;
            }
        } catch (e) {
            console.log(e)
        }
    }
}


async function findRoomNo(socket, Id) {
    return new Promise(resolve => {
        let roomNo;
        if (typeof socket === 'object') roomNo = Array.from(socket.rooms)

        if (roomNo[1] !== undefined) resolve(roomNo[1].toString());
        else {
            let id = typeof Id !== 'string' ? socket.id : Id;
            Object.keys(rooms).forEach(_roomNo => {
                if (Object.keys(rooms).includes(_roomNo.toString()) && rooms[_roomNo.toString()].players.find(player => player.includes(id))) {
                    resolve(_roomNo.toString());
                    return;
                }
            });
        }
    })
}


async function startGame(roomNo, room) {
    let RPS = ['Rock', 'Paper', 'Scissors', 'SHOOT!!!', 'done'];
    const Players = room.players;
    for (let i = 0; i < RPS.length; i++) {
        if (rooms[roomNo] !== undefined && rooms[roomNo].status === '1' && arrays_equal(rooms[roomNo].players, Players)) {
            io.to(roomNo).emit('rps', RPS[i]);
            if (i === 3) await sleep(3000);
            else if (i === 4) {
                io.to(roomNo).emit('unblock-btns');
                await sleep(50);
            }
            else await sleep(600);
        }
    }
}

function decideWinner(roomNo) {
    let responses = afterResponse[roomNo];
    let player1 = responses[0][0];
    let player1Choice = responses[0][1];
    let player2 = responses[1][0];
    let player2Choice = responses[1][1];
    delete afterResponse[roomNo];
    io.to(roomNo).emit('reset', 'btns');
    if (player1Choice === player2Choice) {
        io.to(roomNo).emit('rps-result', ['draw', player1Choice]);
    } else if (player1Choice === 'rock' && player2Choice === 'scissors' || player1Choice === 'scissors' && player2Choice === 'paper' || player1Choice === 'paper' && player2Choice === 'rock') {
        io.to(roomNo).emit('rps-result', [['win', player1, player1Choice], ['lose', player2, player2Choice]]);
    } else {
        io.to(roomNo).emit('rps-result', [['win', player2, player2Choice], ['lose', player1, player1Choice]]);
    }
}

async function retry(socket) {
    let roomNo = await findRoomNo(socket);
    // console.log(retryPlayers)
    if (!Object.keys(retryPlayers).includes(roomNo)) {
        retryPlayers[roomNo] = [];
        io.to(roomNo).emit('retry-ask', socket.id);
    } else {
        delete retryPlayers[roomNo];
        socket.emit('rematch');
    }
}


function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function arrays_equal(a, b) { return !!a && !!b && !(a < b || b < a); }

http.listen(port, () => {
    console.log(`listening on port: ${port}`);
})