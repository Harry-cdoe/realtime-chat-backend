import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.on("connect", () => {

    console.log("Connected:", socket.id);

    const chatId = "69a91973c858758a1f308f69";

    socket.emit("join_chat", chatId);

    console.log("Joined chat:", chatId);

});

socket.on("new_message", (msg) => {

    console.log("Realtime message received:", msg);

});