// REMOVE the import statement from the top
// import * as express from "express";

declare namespace Express {
  interface Request {
    user?: {
      id: string;
      email: string;
    };
  }
}
