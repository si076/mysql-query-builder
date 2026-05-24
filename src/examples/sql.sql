use mysql_query_examples;
CREATE TABLE `price` (
  `product_id` int NOT NULL,
  `price` int DEFAULT NULL,
  PRIMARY KEY (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `product` (
  `product_id` int NOT NULL,
  `sku` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `user` (
  `user_id` int NOT NULL,
  `name` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` int DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
insert into `price` (`product_id`, `price`) values ('1', '1');
insert into `price` (`product_id`, `price`) values ('2', '2');
insert into `price` (`product_id`, `price`) values ('3', '3');
insert into `product` (`product_id`, `sku`) values ('1', 'sku1');
insert into `product` (`product_id`, `sku`) values ('2', 'sku2');
insert into `product` (`product_id`, `sku`) values ('3', 'sku3');
insert into `user` (`user_id`, `name`, `email`, `phone`, `status`) values ('1', 'test1', 'email1@email.com', '123456', '1');
insert into `user` (`user_id`, `name`, `email`, `phone`, `status`) values ('2', 'test2', 'email2@email.com', '123456', '1');