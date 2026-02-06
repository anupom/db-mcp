-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    city VARCHAR(100),
    country VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    price DECIMAL(10, 2) NOT NULL,
    inventory INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    product_id INTEGER REFERENCES products(id),
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Seed users
INSERT INTO users (name, email, status, city, country) VALUES
    ('Alice Johnson', 'alice@example.com', 'active', 'New York', 'USA'),
    ('Bob Smith', 'bob@example.com', 'active', 'Los Angeles', 'USA'),
    ('Carol Williams', 'carol@example.com', 'active', 'Chicago', 'USA'),
    ('David Brown', 'david@example.com', 'inactive', 'Houston', 'USA'),
    ('Eve Davis', 'eve@example.com', 'active', 'London', 'UK'),
    ('Frank Miller', 'frank@example.com', 'active', 'Paris', 'France'),
    ('Grace Wilson', 'grace@example.com', 'active', 'Berlin', 'Germany'),
    ('Henry Moore', 'henry@example.com', 'inactive', 'Tokyo', 'Japan'),
    ('Ivy Taylor', 'ivy@example.com', 'active', 'Sydney', 'Australia'),
    ('Jack Anderson', 'jack@example.com', 'active', 'Toronto', 'Canada');

-- Seed products
INSERT INTO products (name, category, price, inventory) VALUES
    ('Laptop Pro', 'Electronics', 1299.99, 50),
    ('Wireless Mouse', 'Electronics', 49.99, 200),
    ('USB-C Hub', 'Electronics', 79.99, 150),
    ('Mechanical Keyboard', 'Electronics', 149.99, 75),
    ('Monitor 27"', 'Electronics', 399.99, 30),
    ('Desk Chair', 'Furniture', 299.99, 25),
    ('Standing Desk', 'Furniture', 599.99, 15),
    ('Desk Lamp', 'Furniture', 49.99, 100),
    ('Notebook Set', 'Office', 19.99, 500),
    ('Pen Pack', 'Office', 9.99, 1000);

-- Seed orders
INSERT INTO orders (user_id, product_id, amount, status, created_at, completed_at) VALUES
    (1, 1, 1299.99, 'completed', '2024-01-15 10:30:00', '2024-01-16 14:00:00'),
    (1, 2, 49.99, 'completed', '2024-01-15 10:35:00', '2024-01-16 14:00:00'),
    (2, 3, 79.99, 'completed', '2024-01-20 09:00:00', '2024-01-21 11:00:00'),
    (3, 4, 149.99, 'pending', '2024-02-01 14:00:00', NULL),
    (4, 5, 399.99, 'completed', '2024-02-05 16:30:00', '2024-02-07 10:00:00'),
    (5, 6, 299.99, 'completed', '2024-02-10 11:00:00', '2024-02-12 09:00:00'),
    (6, 7, 599.99, 'pending', '2024-02-15 13:00:00', NULL),
    (7, 1, 1299.99, 'completed', '2024-02-20 15:00:00', '2024-02-22 12:00:00'),
    (8, 8, 49.99, 'cancelled', '2024-02-25 10:00:00', NULL),
    (9, 9, 19.99, 'completed', '2024-03-01 09:30:00', '2024-03-02 11:00:00'),
    (10, 10, 9.99, 'completed', '2024-03-05 14:00:00', '2024-03-06 10:00:00'),
    (1, 4, 149.99, 'completed', '2024-03-10 11:30:00', '2024-03-11 15:00:00'),
    (2, 6, 299.99, 'pending', '2024-03-15 16:00:00', NULL),
    (3, 2, 49.99, 'completed', '2024-03-20 10:00:00', '2024-03-21 09:00:00'),
    (5, 1, 1299.99, 'completed', '2024-03-25 12:00:00', '2024-03-27 14:00:00');

-- Create indexes for better performance
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_product_id ON orders(product_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_products_category ON products(category);
