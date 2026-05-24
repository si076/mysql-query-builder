This is a fork of https://github.com/evershopcommerce/mysql-query-builder , node module @evershop/mysql-query-builder.
The purpose of this fork is to: 
 - typescript the code
 - make to string of values optional, by default values are converted to string (Buffer should not be converted)
 - table fields are no more determined with describe query but determined from the data object's keys  
 - replace util's promisify with Promise 
 - implement and add more examples
