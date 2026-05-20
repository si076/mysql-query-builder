import assert from "assert";

import mysql, { ResultSetHeader } from "mysql2";

import {commit, connection, del, getConnection, insert, insertOnUpdate, rollback, select, startTransaction, update} from "../index.js";

class Examples {

    constructor() {

        connection._pool = mysql.createPool({
                                host: process.env.DB_HOST,
                                user: process.env.DB_USER,
                                password: process.env.DB_PASSWORD,
                                database: process.env.DB_DATABASE,
                                socketPath: "/var/lib/mysql/mysql.sock",
                                charset: "utf8mb4",
                                dateStrings: ["DATE","DATETIME"],
                                waitForConnections: false,
                                queueLimit: 0
                            });

    }

    async example1() {
        console.log('--> example1');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }
        const where = select()
                        .from("product")
                        .where("product_id", ">", 1);

        console.log(where._query.sql());
        console.log(where._query._binding);

        const products = await where._query.execute(conn) as any[];

        console.log(products);

        assert.strictEqual(products.length, 2);

        console.log('<-- example1');
    }

    async example2() {
        console.log('--> example2');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }

        const where = select()
                        .from("product")
                        .limit(0, 1)
                        .where("product_id", ">", 1)
                        .and("sku", "LIKE", "sku%");
        
        
        console.log(where._query.sql());
        console.log(where._query._binding);

        const products = await where.execute(conn) as [];

        console.log(products);

        assert.strictEqual(products.length, 1);

        console.log('<-- example2');
    }

    async example3() {
        console.log('--> example3');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }
        const query = select().from("product").orderBy("product_id", "DESC");
        query.where("product_id", ">", 1).and("sku", "LIKE", "sku%");

        console.log(query.sql());
        console.log(query._binding);

        const products = await query.execute(conn) as any[];

        console.log(products);

        assert.strictEqual(products.length, 2);

        console.log('<-- example3');
    }

    async example4() {
        console.log('--> example4');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }
        const query = select().from("product");
        query.leftJoin('price').on('product.`product_id`', '=', 'price.`product_id`');
        query.where('product.`product_id`', ">", 1).and("sku", "LIKE", "sku%");
        query.andWhere("price", ">", 2);

        console.log(query.sql());
        console.log(query._binding);

        const products = await query.execute(conn) as any[];

        console.log(products);

        assert.strictEqual(products.length, 1);

        console.log('<-- example4');
    }

    async example5() {
        console.log('--> example5');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }
        const query = insert("user")
                        .given({user_id: "4", 
                                name: "test4", 
                                email: "email@email.com", 
                                phone: "123456", 
                                status: 1});

        console.log(query.sql());
        console.log(query._binding);

        const res = await query.execute(conn) as ResultSetHeader;

        console.log('affectedRows:', res.affectedRows);

        assert.strictEqual(res.affectedRows, 1);

        console.log('<-- example5');
    }

    async example6() {
        console.log('--> example6');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }
        const where = update("user")
                        .given({status: 2})
                        .where("user_id", "=", 1);

        console.log(where._query.sql());
        console.log(where._query._binding);

        const res = await where.execute(conn) as ResultSetHeader;

        console.log('affectedRows:', res.affectedRows);

        assert.strictEqual(res.affectedRows, 1);

        console.log('<-- example6');
    }

    async example7() {
        console.log('--> example7');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }

        await startTransaction(conn);
        try {
            const query = insert("user")
                            .given({user_id: "3", 
                                    name: "test3", 
                                    email: "email@email.com", 
                                    phone: "123456", 
                                    status: 1});

            console.log(query.sql());
            console.log(query._binding);

            const res = await query.execute(conn) as ResultSetHeader;

            await commit(conn);

            console.log('affectedRows:', res.affectedRows);

            assert.strictEqual(res.affectedRows, 1);

        } catch(e) {
          await rollback(conn);
          console.log(e);
        }

        console.log('<-- example7');
    }

    async example8() {
        console.log('--> example8');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }
        const query = insertOnUpdate("user")
                        .given({user_id: "4", 
                                name: "test4", 
                                email: "email@email.com", 
                                phone: "12345678", 
                                status: 4});

        console.log(query.sql());
        console.log(query._binding);

        const res = await query.execute(conn) as ResultSetHeader;

        console.log('affectedRows:', res.affectedRows);

        assert.strictEqual(res.affectedRows, 2);

        console.log('<-- example8');
    }

    async clear() {
        console.log('--> clear');

        const conn = await getConnection(connection._pool!);
        if (!conn) {
            throw new Error("Cannot obtain a connection");
        }

        let res = await del("user").where("user_id", "=", 3).execute(conn) as ResultSetHeader;
        console.log('affectedRows:', res.affectedRows);

        res = await del("user").where("user_id", "=", 4).execute(conn) as ResultSetHeader;
        console.log('affectedRows:', res.affectedRows);

        res = await update("user")
                        .given({status: 1})
                        .where("user_id", "=", 1).execute(conn) as ResultSetHeader;
        console.log('affectedRows:', res.affectedRows);

        console.log('<-- clear');
    }

    async executeExamples() {
        await this.clear();
        await this.example1();
        await this.example2();
        await this.example3();
        await this.example4();
        await this.example5();
        await this.example6();
        await this.example7();
        await this.example8();
        process.exit(0);
    }
}

(async function runExamples() {
    await new Examples().executeExamples();
})();

