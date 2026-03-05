import { Server } from "socket.io";

let io: Server;

export const initSocket = (server: any) => {

    io = new Server(server, {
        cors: {
            origin: "*"
        }
    });

    io.on("connection", (socket) => {

        console.log("User connected:", socket.id);

        socket.on("join_chat", (chatId: string) => {

            socket.join(chatId);

            console.log(`User joined chat ${chatId}`);

        });

        socket.on("disconnect", () => {

            console.log("User disconnected:", socket.id);

        });

    });

};

export const getIO = () => {

    if (!io) {
        throw new Error("Socket not initialized");
    }

    return io;

};