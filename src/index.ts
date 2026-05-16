import { x as uniqid } from "uniqid";
// import { util } from "util";
import { toString } from "./toString.js";
import { fieldResolve }  from "./fieldResolve.js";
import mySQL from "mysql2";

class Select {
  _fields: string[] = [];

  constructor() {}

  select(field: string, alias?: string) {
    // Resolve field name
    let f = "";
    if (
      /^([A-Z][A-Z0-9_]*\s*\()((?:(?:"(?:\\"|[^"])*")|(?:'(?:\\'|[^'])*')|(?:`(?:\\`|[^`])*`)|[^'"\s]*))(?:\s*,\s*((?:(?:"(?:\\"|[^"])*")|(?:'(?:\\'|[^'])*')|(?:`(?:\\`|[^`])*`)|[^'"\s]*)))*\)$/i.test(
        field
      ) ||
      /^[a-zA-Z_1-9]+([.])(`)[a-zA-Z0-9-_]+(`)$/.test(field) ||
      /^[a-zA-Z_1-9]+([.])([*])$/.test(field) ||
      /^[A-Z ]+([(])[a-zA-Z0-9* _=<>(,&).`!']+([)])$/.test(field)
    ) {
      f += `${field}`;
    } else {
      f += `\`${field}\``;
    }
    if (alias) f += ` AS ${alias}`;

    this._fields.push(f);

    return this;
  }

  render() {
    var stm = "SELECT ";
    if (this._fields.length === 0) stm = stm + "*  ";
    else
      this._fields.forEach((element) => {
        stm += `${element}, `;
      });

    return stm.slice(0, -2);
  }

  clone() {
    let cp = new select();
    cp._fields = this._fields;

    return cp;
  }
}

class Leaf {
  _binding: {[key:string]: any} = {};
  _link: string;
  _field: string;
  _operator: string;
  _value: string;
  _parent?: Node;

  constructor(link: string, field: string, 
              operator: string, value: any, 
              node?: Node) {
    
    // Check if the value is a column or not
    if (/^[`a-zA-Z_1-9]+([.])(`)[a-zA-Z0-9-_]+(`)$/.test(value))
      this._value = value;
    else {
      if (
        operator.toUpperCase() === "IN" ||
        operator.toUpperCase() === "NOT IN"
      ) {
        if (Array.isArray(value) && value.length > 0) {
          this._value = "(";
          value.forEach((element) => {
            const key = uniqid();
            this._value = this._value + `:${key}, `;
            this._binding[key] = element;
          });
          this._value = this._value.slice(0, -2) + ")";
        } else if (Array.isArray(value) && value.length === 0) {
          this._value = "(FALSE)";
        } else {
          throw new Error(`Expect an array, got ${typeof value}`);
        }
      } else {
        const key = uniqid();
        this._binding[key] = toString(value);
        this._value = `:${key}`;
      }
    }
    this._link = link;
    this._field = fieldResolve(field);
    this._operator = operator.toUpperCase();
    this._parent = node;
  }

  getBinding() {
    return this._binding;
  }

  parent() {
    return this._parent;
  }

  render() {
    return `${this._link} ${this._field} ${this._operator} ${this._value}`;
  }

  clone(node: Node) {
    let cp = new Leaf("AND", "dummy", "=", "dummy"); // This is really dirty
    cp._binding = this._binding;
    cp._field = this._field;
    cp._link = this._link;
    cp._operator = this._operator;
    cp._value = this._value;
    cp._parent = node;

    return cp;
  }
}

class Node {
  _tree: (Leaf | Node)[] = [];
  _link?: string;
  _parent?: Node;
  _query: Query;

  constructor(query: Query) {
    this._query = query;
  }

  addLeaf(link: string, field: string, operator: string, value: any, node: Node = this) {
    this._tree.push(new Leaf(link, field, operator, value, node));

    // Return this for chaining
    return this;
  }

  addNode(node: Node) {
    node._parent = this;
    this._tree.push(node);

    return node;
  }

  /**
   * This method will empty the tree
   */
  empty() {
    this._tree = [];

    return this;
  }

  getLeafs() {
    return this._tree.filter((e) => e instanceof Leaf);
  }

  getNodes() {
    return this._tree.filter((e) => e instanceof Node);
  }

  isEmpty() {
    // return !this.getLeafs().length > 0 && !this.getNodes().length > 0;
    return this._tree.length == 0;
  }

  findLeaf(link: string, field: string, operator: string, value: any) {
    this._tree.forEach((element, index) => {
      if (element instanceof Leaf) { 
        if(element._link === link &&
           element._field === fieldResolve(field) &&
           element._binding[field] === value ) {
            return element;
        }
      }
      else {
        return element.findLeaf(link, field, operator, value);
      }
    });
  }

  getBinding() {
    let binding = {};
    this._tree.forEach((element, index) => {
      Object.assign(binding, element.getBinding());
    });

    return binding;
  }

  and(field: string, operator: string, value: any) {
    this.addLeaf("AND", field, operator, value);

    return this;
  }

  or(field: string, operator: string, value: any) {
    this.addLeaf("OR", field, operator, value);

    return this;
  }

  render() {
    if (this._tree.length === 0) return "";

    let statement = `${this._link} (`;
    this._tree.forEach((element, index) => {
      if (index === 0)
        statement += ` ${element.render()}`.slice(this._link === "AND" ? 5 : 4);
      else statement += ` ${element.render()}`;
    });

    statement += ")";

    return statement;
  }

  // a "proxy" function to Query execute method
  async execute(connection: mySQL.PoolConnection, releaseConnection = true) {
    return await this._query.execute(connection, releaseConnection);
  }

  // a "proxy" function to Query load method
  async load(connection: mySQL.PoolConnection, releaseConnection = true) {
    return await this._query.load(connection, releaseConnection);
  }

  clone(query: Query, parent: Node) {
    let cp = new Node(query);
    cp._link = this._link;
    cp._parent = parent;
    cp._tree = this._tree.map((t) => {
      if (t instanceof Leaf) {
        return t.clone(cp);
      } else { 
        return t.clone(query, cp);
      }
    });

    return cp;
  }
}

class Join {
  _joins: {type: string, table: string, alias: string, on: Node}[] = [];
  _query: Query;

  constructor(query: Query) {
    this._joins = [];
    this._query = query;
  }

  add(type: string, table: string, alias: string) {
    this._joins.push({
      type,
      table,
      alias: alias || table,
      on: new Node(this._query),
    });

    return this;
  }

  on(column: string, operator: string, referencedColumn: string) {
    if (this._joins.length === 0) throw new Error("Invalid call");

    let node = this._joins[this._joins.length - 1]["on"];
    node._link = "ON";
    node.addLeaf("AND", column, operator, referencedColumn, node);

    return node;
  }

  render() {
    if (this._joins.length === 0) return "";

    let stm = "";
    this._joins.forEach((join) => {
      stm += `${join.type} ${join.table} AS ${join.alias} ${join.on.render()} `;
      Object.assign(this._query._binding, join.on.getBinding());
    });

    return stm;
  }

  clone(query: Query) {
    let cp = new Join(query);
    cp._joins = this._joins;

    return cp;
  }
}

class Where extends Node {

  constructor(query: Query) {
    super(query);
  }

  render() {
    Object.assign(this._query._binding, this.getBinding());
    let render = super.render();
    if (render === "") return "";
    else return "WHERE " + render.slice(4);
  }

  andWhere(field: string, operator: string, value: any) {
    let node = new Node(this._query);
    node._link = "AND";
    node._parent = this;
    node.addLeaf("AND", field, operator, value, this);
    this.addNode(node);

    return node;
  }

  orWhere(field: string, operator: string, value: any) {
    let node = new Node(this._query);
    node._link = "OR";
    node._parent = this;
    node.addLeaf("OR", field, operator, value, this);
    this.addNode(node);

    return node;
  }

  clone(query: Query) {
    let cp = new Where(query);
    cp._link = this._link;
    cp._tree = this._tree.map((t) => {
      if (t instanceof Leaf) return t.clone(cp);
      else return t.clone(query, cp);
    });

    return cp;
  }
}

class Having extends Node {
  _link: string = "HAVING";

  constructor(query: Query) {
    super(query);
  }

  render() {
    Object.assign(this._query._binding, this.getBinding());
    return super.render();
  }

  clone(query: Query) {
    let cp = new Having(query);
    cp._tree = this._tree.map((t) => {
      if (t instanceof Leaf) return t.clone(cp);
      else return t.clone(query, cp);
    });

    return cp;
  }
}

class Limit {
  _offset: number;
  _limit: number;

  constructor(_offset: number = 0, _limit: number = 1000000000) {
    this._offset = _offset;
    this._limit = _limit;
  }

  render() {
    if ((this._offset === this._limit) === null) return "";
    return `LIMIT ${+this._offset || 0}, ${
      this._limit === null ? 1000000000 : this._limit
    }`;
  }

  clone() {
    return new Limit(this._offset, this._limit);
  }
}

class GroupBy {
  _fields: string[] = [];

  constructor() {}

  add(field: string) {
    this._fields.push(fieldResolve(field));

    return this;
  }

  render() {
    if (this._fields.length === 0) return "";
    return `GROUP BY ${this._fields.join(",")}`;
  }

  clone() {
    let cp = new GroupBy();
    cp._fields = [...this._fields];

    return cp;
  }
}

class OrderBy {

  _field: string | null = null;
  _direction: string = "DESC";

  constructor() {
  }

  add(field: string | null, direction: string) {
    this._field = field;
    this._direction = direction == null ? "DESC" : direction;

    return this;
  }

  render() {
    if (this._field === null) return "";

    return `ORDER BY ${this._field} ${this._direction}`;
  }

  clone() {
    let cp = new OrderBy();
    cp._field = this._field;
    cp._direction = this._direction;

    return cp;
  }
}

class Query {
  _where: Where;
  _binding: {[key: string]: any} = [];

  constructor() {
    this._where = new Where(this);
  }

  /**
   * @returns {Where|Node}
   */
  where(field: string, operator: string, value: any) {
    // This method will reset the `_where` object. Call `andWhere` or `orWhere` if you want to add more condition
    this._where = new Where(this);
    this._where._link = "AND";
    this._where.addLeaf("AND", field, operator, value, this._where);

    return this._where;
  }

  andWhere(field: string, operator: string, value: any) {
    if (this._where.isEmpty() === true)
      return this.where(field, operator, value);
    return this._where.andWhere(field, operator, value);
  }

  orWhere(field: string, operator: string, value: any) {
    if (this._where.isEmpty() === true)
      return this.where(field, operator, value);

    return this._where.orWhere(field, operator, value);
  }

  getWhere() {
    return this._where;
  }

  getBinding() {
    return this._binding;
  }

  async executeQuery(connection: mySQL.PoolConnection, 
                     sql: string, values: mySQL.QueryValues) {
    return new Promise((resolve, reject) => {
                          connection.query(
                                  sql, 
                                  values,
                                  (err: mySQL.QueryError | null, 
                                   result: any, 
                                   fields: mySQL.FieldPacket[]) => {
                                     if (err) {
                                       reject(err);
                                     } else {
                                       resolve(result);
                                     }
                          })
                });
  }

  async execute(connection: mySQL.PoolConnection, releaseConnection = true) {
    let sql = await this.sql(connection);
    let binding = [];
    for (let key in this._binding) {
      if (this._binding.hasOwnProperty(key)) {
        sql = sql.replace(`:${key}`, "?");
        binding.push(this._binding[key]);
      }
    }
    let result = await this.executeQuery(connection, sql, binding);
    if (releaseConnection) release(connection);

    return result;
  }

  async describeFields(connection: mySQL.PoolConnection, table: string): Promise<{[key: string]: string}[]> {
    return new Promise((resolve, reject) => {
                        connection.query(`DESCRIBE \`${table}\``,
                          (err: mySQL.QueryError | null, 
                           result: {[key: string]: string}[], 
                           fields: mySQL.FieldPacket[]) => {
                             if (err) {
                               reject(err);
                             } else {
                               resolve(result);
                             }
                          })
                      });    
  }

  async sql(connection: mySQL.PoolConnection): Promise<string> {
    throw new Error('To be implemented by subclasses');
  }

  async load(connection: mySQL.PoolConnection, releaseConnection = true) {
    throw new Error('To be implemented by subclasses');
  }
}

class SelectQuery extends Query {
  _table: string | undefined = undefined;
  _alias: string | undefined = undefined;
  _select = new Select();
  _having = new Having(this);
  _join = new Join(this);
  _limit = new Limit();
  _groupBy = new GroupBy();
  _orderBy = new OrderBy();

  constructor() {
    super();
  }

  select(field: string, alias?: string) {
    this._select.select(field, alias);

    return this;
  }

  from(table: string, alias: string) {
    this._table = table;
    this._alias = alias;
    return this;
  }

  having(field: string, operator: string, value: any) {
    this._having.and(field, operator, value);

    return this._having;
  }

  leftJoin(table: string, alias: string) {
    this._join.add("LEFT JOIN", table, alias);

    return this._join;
  }

  rightJoin(table: string, alias: string) {
    this._join.add("RIGHT JOIN", table, alias);

    return this._join;
  }

  innerJoin(table: string, alias: string) {
    this._join.add("INNER JOIN", table, alias);

    return this._join;
  }

  limit(offset: number, limit: number) {
    this._limit = new Limit(offset, limit);

    return this;
  }

  groupBy() {
    let args = [].slice.call(arguments);

    args.forEach((element) => {
      this._groupBy.add(String(element));
    });

    return this;
  }

  orderBy(field: string | null, direction = "ASC") {
    this._orderBy.add(field, direction);

    return this;
  }

  async sql(connection: mySQL.PoolConnection): Promise<string> {
    if (!this._table)
      throw Error("You must specific table by calling `from` method");

    let from = `\`${this._table}\``;
    if (this._alias) from += ` AS \`${this._alias}\``;

    return [
      this._select.render().trim(),
      "FROM",
      from.trim(),
      this._join.render().trim(),
      this._where.render().trim(),
      this._groupBy.render().trim(),
      this._having.render().trim(),
      this._orderBy.render().trim(),
      this._limit.render().trim(),
    ]
      .filter((e) => e !== "")
      .join(" ");
  }

  async load(connection: mySQL.PoolConnection, releaseConnection = true) {
    this.limit(0, 1);
    let results = await this.execute(connection, releaseConnection);

    return (results instanceof Array && results[0]) || null;
  }

  async execute(conn: mySQL.Pool | mySQL.PoolConnection, releaseConnection = true) {
    let connection = conn;
    if (!(connection instanceof mySQL.PoolConnection)) {
      connection = await getConnection(connection);
    }
    let sql = await this.sql(connection);
    let binding = [];
    for (var key in this._binding) {
      if (this._binding.hasOwnProperty(key)) {
        sql = sql.replace(`:${key}`, "?");
        binding.push(this._binding[key]);
      }
    }

    try {
      let result = await this.executeQuery(connection, sql, binding);
      if (releaseConnection) release(connection);
      return result;
    } catch (e) {
      if (isNodeJSErrnoException(e) && e.errno === 1054) {
        this.orderBy(null);
        return await super.execute(connection, releaseConnection);
      } else {
        if (releaseConnection) release(connection);
        throw e;
      }
    }
  }

  clone() {
    let cp = new SelectQuery();
    cp._table = this._table;
    cp._alias = this._alias;
    cp._where = this._where.clone(cp);
    cp._having = this._having.clone(cp);
    cp._join = this._join.clone(cp);
    cp._limit = this._limit.clone();
    cp._groupBy = this._groupBy.clone();
    cp._orderBy = this._orderBy.clone();

    return cp;
  }
}

class UpdateQuery extends Query {
  _table: string;
  _data: {[key: string]: any} = {};

  constructor(table: string) {
    // Private
    super();
    this._table = table;
    this._data = {};
  }

  given(data: {[key: string]: any}) {
    if (typeof data !== "object" || data === null) {
      throw new Error("Data must be an object and not null");
    }
    let copy: {[key: string]: any} = {};
    Object.keys(data).forEach((key) => {
      copy[key] = toString(data[key]);
    });
    this._data = copy;

    return this;
  }

  prime(field: string, value: any) {
    this._data[field] = toString(value);

    return this;
  }

  async sql(connection: mySQL.PoolConnection) {
    if (!this._table) throw Error("You need to call specific method first");
    if (Object.keys(this._data).length === 0)
      throw Error("You need provide data first");

    let fields: {[key: string]: string}[] = await this.describeFields(connection, this._table);

    let set: string[] = [];
    fields.forEach((field) => {
      if (field["Extra"] === "auto_increment") return;
      if (this._data[field["Field"]] === undefined) return;
      let key = uniqid();
      set.push(`\`${field["Field"]}\` = :${key}`);
      this._binding[key] = this._data[field["Field"]];
    });
    if (set.length === 0) throw new Error("No data was provided" + this._table);

    var sql = [
      "UPDATE",
      `\`${this._table}\``,
      "SET",
      set.join(", "),
      this._where.render(),
    ]
      .filter((e) => e !== "")
      .join(" ");

    return sql;
  }
}

class InsertQuery extends Query {
  _table: string;
  _data: {[key: string]: any} = {};

  constructor(table: string) {
    // Private
    super();
    this._table = table;
  }

  given(data: {[key: string]: any}) {
    if (typeof data !== "object" || data === null) {
      throw new Error("Data must be an object and not null");
    }
    let copy: {[key: string]: any} = {};
    Object.keys(data).forEach((key) => {
      copy[key] = toString(data[key]);
    });
    this._data = copy;

    return this;
  }

  prime(field: string, value: any) {
    this._data[field] = toString(value);

    return this;
  }

  async sql(connection: mySQL.PoolConnection) {
    if (!this._table) throw Error("You need to call specific method first");

    if (Object.keys(this._data).length === 0)
      throw Error("You need provide data first");

    let fields = await this.describeFields(connection, this._table);

    let fs: string[] = [],
        vs: string[] = [];
    fields.forEach((field) => {
      if (field["Extra"] === "auto_increment") return;
      if (this._data[field["Field"]] === undefined) return;
      let key = uniqid();
      fs.push(`\`${field["Field"]}\``);
      vs.push(`:${key}`);
      this._binding[key] = this._data[field["Field"]];
    });

    let sql = [
      "INSERT INTO",
      `\`${this._table}\``,
      "(",
      fs.join(", "),
      ")",
      "VALUES",
      "(",
      vs.join(", "),
      ")",
    ]
      .filter((e) => e !== "")
      .join(" ");

    return sql;
  }
}

class InsertOnUpdateQuery extends Query {
  _table: string;
  _data: {[key: string]: any} = {};

  constructor(table: string) {
    // Private
    super();
    this._table = table;
  }

  given(data: {[key: string]: any}) {
    if (typeof data !== "object" || data === null) {
      throw new Error("Data must be an object and not null");
    }
    let copy: {[key: string]: any} = {};
    Object.keys(data).forEach((key) => {
      copy[key] = toString(data[key]);
    });
    this._data = copy;

    return this;
  }

  prime(field: string, value: any) {
    this._data[field] = toString(value);

    return this;
  }

  async sql(connection: mySQL.PoolConnection) {
    if (!this._table) throw Error("You need to call specific method first");

    if (Object.keys(this._data).length === 0)
      throw Error("You need provide data first");

    let fields = await this.describeFields(connection, this._table);

    let fs: string[] = [],
        vs: string[] = [],
        us: string[] = [],
        usp: any[]   = [];
    fields.forEach((field) => {
      if (field["Extra"] === "auto_increment") return;
      if (this._data[field["Field"]] === undefined) return;
      let key = uniqid();
      let ukey = uniqid();
      fs.push(`\`${field["Field"]}\``);
      vs.push(`:${key}`);
      us.push(`\`${field["Field"]}\` = :${ukey}`);
      usp[ukey] = this._data[field["Field"]];
      this._binding[key] = this._data[field["Field"]];
    });

    this._binding = { ...this._binding, ...usp };

    let sql = [
      "INSERT INTO",
      `\`${this._table}\``,
      "(",
      fs.join(", "),
      ")",
      "VALUES",
      "(",
      vs.join(", "),
      ")",
      "ON DUPLICATE KEY UPDATE",
      us.join(", "),
    ]
      .filter((e) => e !== "")
      .join(" ");

    return sql;
  }
}

class DeleteQuery extends Query {
  _table: string;

  constructor(table: string) {
    // Private
    super();
    this._table = table;
  }

  async sql(connection: mySQL.PoolConnection) {
    if (!this._table) throw Error("You need to call specific method first");

    return [
      "DELETE FROM",
      `\`${this._table}\``,
      this._where.render().trim(),
    ].join(" ");
  }
}

module.exports = {
  select,
  insert,
  update,
  node,
  del,
  insertOnUpdate,
  getConnection,
  startTransaction,
  commit,
  rollback,
  release,
  execute,
};

function select() {
  let select = new SelectQuery();
  let args = [...arguments];
  if (args[0] === "*") return select;
  args.forEach((arg) => {
    if (typeof arg == "string") select.select(arg);
  });

  return select;
}

function insert(table: string) {
  return new InsertQuery(table);
}

function insertOnUpdate(table: string) {
  return new InsertOnUpdateQuery(table);
}

function update(table: string) {
  return new UpdateQuery(table);
}

function del(table: string) {
  return new DeleteQuery(table);
}

function node(link: string) {
  let node = new Node();
  node._link = link;

  return node;
}

/* Create a connection from a pool */
async function getConnection(pool: mySQL.Pool): Promise<mySQL.PoolConnection> {
  return new Promise((resolve, reject) => {
                      pool.getConnection((
                        err: NodeJS.ErrnoException | null,
                        connection: mySQL.PoolConnection
                      ) => {
                        if (err) {
                          reject(err);
                        } else {
                          resolve(connection);
                        }
                      });
                    });
}

class ConnectionState {
  INTRANSACTION: boolean = false;
  COMMITTED = false;
  _pool: mySQL.Pool | null = null;
}

const connection = new ConnectionState();

async function startTransaction(conn: mySQL.PoolConnection) {
  await execute(conn, "SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
  await execute(conn, "SET autocommit = 0");
  await execute(conn, "START TRANSACTION");
  connection.INTRANSACTION = true;
  connection.COMMITTED = false;
}

async function commit(conn: mySQL.PoolConnection) {
  await execute(conn, "COMMIT");
  await execute(conn, "SET autocommit = 1");
  connection.INTRANSACTION = false;
  connection.COMMITTED = true;
  release(conn);
}

async function rollback(connection: mySQL.PoolConnection) {
  await execute(connection, "ROLLBACK");
  connection.destroy();
}

function release(conn: mySQL.PoolConnection) {
  if (connection.INTRANSACTION === true) {
    return;
  }
  if (connection._pool) {
    connection._pool.releaseConnection(conn);
  }
}

async function execute(connection: mySQL.PoolConnection, query: string) {
  return new Promise((resolve, reject) => {
                  connection.query(query,
                    (err: mySQL.QueryError | null, 
                     result: any, 
                     fields: mySQL.FieldPacket[]) => {
                       if (err) {
                         reject(err);
                       } else {
                         resolve(result);
                       }
                     })
              });
}

type JsType =
    | "bigint"
    | "boolean"
    | "function"
    | "number"
    | "object"
    | "string"
    | "symbol"
    | "undefined";
            
function isNodeJSErrnoException(value: unknown): value is NodeJS.ErrnoException {
    for (const [key, jsType] of [
          ["code", "string"],
          ["errno", "number"],
          ["syscall", "string"],
          ["path", "string"],
          ["stack", "string"]] satisfies [keyof NodeJS.ErrnoException, JsType][]) {
      if (typeof (value as NodeJS.ErrnoException)[key] !== jsType) return false;
    }

    return true;
}
