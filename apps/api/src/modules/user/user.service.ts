import { prisma } from "../../../../../packages/postgres/src/client";

export interface CreateUserInput {
    name: string;
    email: string;
    password: string;
    avatarUrl?: string;
}

export class UserService {
    /**
     * Create a new user
     */
    static async createUser(data: CreateUserInput) {
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw new Error("User already exists with this email");
        }

        return prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: data.password,
                avatarUrl: data.avatarUrl,
            },
        });
    }

    /**
     * Find user by email
     */
    static async findByEmail(email: string) {
        return prisma.user.findUnique({
            where: { email },
        });
    }

    /**
     * Find user by ID
     */
    static async findById(id: string) {
        return prisma.user.findUnique({
            where: { id },
        });
    }

}