# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { addNewProduct, getProductById, updateExistingStockQuantity, listAllProducts } from '@dataconnect/generated';


// Operation AddNewProduct:  For variables, look at type AddNewProductVars in ../index.d.ts
const { data } = await AddNewProduct(dataConnect, addNewProductVars);

// Operation GetProductById:  For variables, look at type GetProductByIdVars in ../index.d.ts
const { data } = await GetProductById(dataConnect, getProductByIdVars);

// Operation UpdateExistingStockQuantity:  For variables, look at type UpdateExistingStockQuantityVars in ../index.d.ts
const { data } = await UpdateExistingStockQuantity(dataConnect, updateExistingStockQuantityVars);

// Operation ListAllProducts: 
const { data } = await ListAllProducts(dataConnect);


```