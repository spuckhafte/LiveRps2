let socket = io.connect('/');

window.onload = () => {
    let name = localStorage.getItem('name');
    if (name === null) {
        let username = prompt('Enter your name:');
        if (username === null) {
            location.reload();
            return;
        }
        localStorage.setItem('name', username)
        location.reload();
    } else {
        socket.emit('join', name);
    }
}

socket.on('joined', room => {
    room = JSON.parse(room);
    reset();
    if (room.status === '0') showIds(room, '0');
    else {
        showIds(room, '1');
        if (socket.id === room.players[1].split('-')[1]) {
            socket.emit('ready');
        }
    }
})

socket.on('left', room => {
    room = JSON.parse(room);
    showIds(room, '0');
})

socket.on('rps', rps => {
    if (rps === 'done') {
        if ($('.interact').hasClass('noblock')) {
            socket.emit('select', 'none');
            $('.interact').removeClass('noblock');
            $('#leave').removeClass('no');
            $('#retry').removeClass('no');
        }
        return;
    }
    document.querySelector('#rps').innerHTML += rps + '<br>';
    if (rps === 'SHOOT!!!') $('.interact').addClass('noblock');
})

socket.on('no-response', () => {
    // console.log('no response')
    reset();
    $('#result-id').text('No Response')
})

socket.on('rps-result', result => {
    if (result[0] === 'draw') {
        $('#result-id').addClass('tie');
        $('#result-id').text(`Draw :: (${result[1]} vs ${result[1]})`);
    } else {
        if (result[0][1] === socket.id) {
            $('#result-id').addClass('won');
            $('#result-id').text(`You Win :: (${result[0][2]} vs ${result[1][2]})`);
            $('#myscore').text(parseInt($('#myscore').text()) + 1);
        }
        if (result[1][1] === socket.id) {
            $('#result-id').addClass('lost');
            $('#result-id').text(`You Lose :: (${result[1][2]} vs ${result[0][2]})`);
            $('#partnerscore').text(parseInt($('#partnerscore').text()) + 1);
        }
    }
})

socket.on('reset', (query, q2) => { reset(query, q2); })

socket.on('retry-ask', firstId => {
    if (socket.id !== firstId) {
        $('#retry-text').html('Rival wants rematch, Retry?');
        $('#retry-text').removeClass('hide')
    }
})

socket.on('rematch', () => {
    reset('btns');
    socket.emit('ready');
})

socket.on('block-btns', () => {
    $('#leave').addClass('no');
    $('#retry').addClass('no');
})

socket.on('unblock-btns', () => {
    $('#leave').removeClass('no');
    $('#retry').removeClass('no');
})

socket.on('empty-new-room', () => {
    $('#partner').text('finding rival...');
})

$('#leave').click(() => {
    if ($('#partner').text() !== 'finding rival...') {
        if ($('#leave').hasClass('no')) return;
        socket.emit('leave-room');
    }
})

$('#retry').click(() => {
    if ($('#partner').text() !== 'finding rival...') {
        if ($('#retry').hasClass('no')) return;
        $('#retry').addClass('no');
        socket.emit('retry', $('#result-id').text(), $('#partner').text());
    }
});

function action(element) {
    let rps = element.id;
    $('.interact').removeClass('noblock');
    socket.emit('select', rps);
}

function showIds(room, query) {
    if (query === '0') {
        $('#you').text(room.players[0]);
        $('#partner').text('finding rival...');
    } else {
        if (socket.id === room.players[0].split('-')[1]) {
            $('#you').text(room.players[0]);
            $('#partner').text(room.players[1]);
        } else {
            $('#you').text(room.players[1]);
            $('#partner').text(room.players[0]);
        }
    }
}

function reset(query, query2) {
    $('#rps').html('');
    $('.interact').removeClass('noblock');
    $('#result-id').html('');
    $('#result-id').attr('class', 'result');
    $('#retry-text').addClass('hide');
    if (query === 'score') {
        $('#myscore').text('0');
        $('#partnerscore').text('0');
    }
    if (query === 'btns' || query2 === 'btns') {
        $('#leave').removeClass('no');
        $('#retry').removeClass('no');
    }
}