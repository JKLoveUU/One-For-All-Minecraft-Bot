process.on('message', (message) => {
    switch(message.type){
        case 'cmd':
            //交給CommandManager
            break;
        case 'chat':
            console.log('傳送訊息:', message.text);
            break;
        case 'exit':
            process.exit(0)
            break;
        default:
            console.log('message from parent:', message);
    }
});