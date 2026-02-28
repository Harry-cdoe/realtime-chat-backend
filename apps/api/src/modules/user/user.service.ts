import { prisma } from "../../../../../packages/postgres/src/client";
import bcrypt from "bcrypt";

export interface CreateUserInput {
    name: string;
    email: string;
    password: string;
    avatarUrl?: string;
}

export class UserService {

    static async createUser(data: CreateUserInput) {

        // Check existing user
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw new Error("User already exists");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Create user
        return prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hashedPassword,
                avatarUrl: data.avatarUrl,
            },
        });
    }

    static async findByEmail(email: string) {
        return prisma.user.findUnique({
            where: { email },
        });
    }

    static async findById(id: string) {
        return prisma.user.findUnique({
            where: { id },
        });
    }
}