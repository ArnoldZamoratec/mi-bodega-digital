# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetProductById*](#getproductbyid)
  - [*ListAllProducts*](#listallproducts)
- [**Mutations**](#mutations)
  - [*AddNewProduct*](#addnewproduct)
  - [*UpdateExistingStockQuantity*](#updateexistingstockquantity)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetProductById
You can execute the `GetProductById` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getProductById(vars: GetProductByIdVariables): QueryPromise<GetProductByIdData, GetProductByIdVariables>;

interface GetProductByIdRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetProductByIdVariables): QueryRef<GetProductByIdData, GetProductByIdVariables>;
}
export const getProductByIdRef: GetProductByIdRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getProductById(dc: DataConnect, vars: GetProductByIdVariables): QueryPromise<GetProductByIdData, GetProductByIdVariables>;

interface GetProductByIdRef {
  ...
  (dc: DataConnect, vars: GetProductByIdVariables): QueryRef<GetProductByIdData, GetProductByIdVariables>;
}
export const getProductByIdRef: GetProductByIdRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getProductByIdRef:
```typescript
const name = getProductByIdRef.operationName;
console.log(name);
```

### Variables
The `GetProductById` query requires an argument of type `GetProductByIdVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetProductByIdVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `GetProductById` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetProductByIdData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetProductByIdData {
  product?: {
    id: UUIDString;
    barcode?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    name: string;
    price: number;
    stockQuantity: number;
  } & Product_Key;
}
```
### Using `GetProductById`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getProductById, GetProductByIdVariables } from '@dataconnect/generated';

// The `GetProductById` query requires an argument of type `GetProductByIdVariables`:
const getProductByIdVars: GetProductByIdVariables = {
  id: ..., 
};

// Call the `getProductById()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getProductById(getProductByIdVars);
// Variables can be defined inline as well.
const { data } = await getProductById({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getProductById(dataConnect, getProductByIdVars);

console.log(data.product);

// Or, you can use the `Promise` API.
getProductById(getProductByIdVars).then((response) => {
  const data = response.data;
  console.log(data.product);
});
```

### Using `GetProductById`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getProductByIdRef, GetProductByIdVariables } from '@dataconnect/generated';

// The `GetProductById` query requires an argument of type `GetProductByIdVariables`:
const getProductByIdVars: GetProductByIdVariables = {
  id: ..., 
};

// Call the `getProductByIdRef()` function to get a reference to the query.
const ref = getProductByIdRef(getProductByIdVars);
// Variables can be defined inline as well.
const ref = getProductByIdRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getProductByIdRef(dataConnect, getProductByIdVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.product);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.product);
});
```

## ListAllProducts
You can execute the `ListAllProducts` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listAllProducts(): QueryPromise<ListAllProductsData, undefined>;

interface ListAllProductsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListAllProductsData, undefined>;
}
export const listAllProductsRef: ListAllProductsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listAllProducts(dc: DataConnect): QueryPromise<ListAllProductsData, undefined>;

interface ListAllProductsRef {
  ...
  (dc: DataConnect): QueryRef<ListAllProductsData, undefined>;
}
export const listAllProductsRef: ListAllProductsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listAllProductsRef:
```typescript
const name = listAllProductsRef.operationName;
console.log(name);
```

### Variables
The `ListAllProducts` query has no variables.
### Return Type
Recall that executing the `ListAllProducts` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListAllProductsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListAllProductsData {
  products: ({
    id: UUIDString;
    name: string;
    price: number;
    stockQuantity: number;
  } & Product_Key)[];
}
```
### Using `ListAllProducts`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listAllProducts } from '@dataconnect/generated';


// Call the `listAllProducts()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listAllProducts();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listAllProducts(dataConnect);

console.log(data.products);

// Or, you can use the `Promise` API.
listAllProducts().then((response) => {
  const data = response.data;
  console.log(data.products);
});
```

### Using `ListAllProducts`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listAllProductsRef } from '@dataconnect/generated';


// Call the `listAllProductsRef()` function to get a reference to the query.
const ref = listAllProductsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listAllProductsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.products);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.products);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## AddNewProduct
You can execute the `AddNewProduct` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
addNewProduct(vars: AddNewProductVariables): MutationPromise<AddNewProductData, AddNewProductVariables>;

interface AddNewProductRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddNewProductVariables): MutationRef<AddNewProductData, AddNewProductVariables>;
}
export const addNewProductRef: AddNewProductRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
addNewProduct(dc: DataConnect, vars: AddNewProductVariables): MutationPromise<AddNewProductData, AddNewProductVariables>;

interface AddNewProductRef {
  ...
  (dc: DataConnect, vars: AddNewProductVariables): MutationRef<AddNewProductData, AddNewProductVariables>;
}
export const addNewProductRef: AddNewProductRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the addNewProductRef:
```typescript
const name = addNewProductRef.operationName;
console.log(name);
```

### Variables
The `AddNewProduct` mutation requires an argument of type `AddNewProductVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface AddNewProductVariables {
  barcode?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  name: string;
  price: number;
  stockQuantity: number;
}
```
### Return Type
Recall that executing the `AddNewProduct` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `AddNewProductData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface AddNewProductData {
  product_insert: Product_Key;
}
```
### Using `AddNewProduct`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, addNewProduct, AddNewProductVariables } from '@dataconnect/generated';

// The `AddNewProduct` mutation requires an argument of type `AddNewProductVariables`:
const addNewProductVars: AddNewProductVariables = {
  barcode: ..., // optional
  description: ..., // optional
  imageUrl: ..., // optional
  name: ..., 
  price: ..., 
  stockQuantity: ..., 
};

// Call the `addNewProduct()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await addNewProduct(addNewProductVars);
// Variables can be defined inline as well.
const { data } = await addNewProduct({ barcode: ..., description: ..., imageUrl: ..., name: ..., price: ..., stockQuantity: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await addNewProduct(dataConnect, addNewProductVars);

console.log(data.product_insert);

// Or, you can use the `Promise` API.
addNewProduct(addNewProductVars).then((response) => {
  const data = response.data;
  console.log(data.product_insert);
});
```

### Using `AddNewProduct`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, addNewProductRef, AddNewProductVariables } from '@dataconnect/generated';

// The `AddNewProduct` mutation requires an argument of type `AddNewProductVariables`:
const addNewProductVars: AddNewProductVariables = {
  barcode: ..., // optional
  description: ..., // optional
  imageUrl: ..., // optional
  name: ..., 
  price: ..., 
  stockQuantity: ..., 
};

// Call the `addNewProductRef()` function to get a reference to the mutation.
const ref = addNewProductRef(addNewProductVars);
// Variables can be defined inline as well.
const ref = addNewProductRef({ barcode: ..., description: ..., imageUrl: ..., name: ..., price: ..., stockQuantity: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = addNewProductRef(dataConnect, addNewProductVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.product_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.product_insert);
});
```

## UpdateExistingStockQuantity
You can execute the `UpdateExistingStockQuantity` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateExistingStockQuantity(vars: UpdateExistingStockQuantityVariables): MutationPromise<UpdateExistingStockQuantityData, UpdateExistingStockQuantityVariables>;

interface UpdateExistingStockQuantityRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateExistingStockQuantityVariables): MutationRef<UpdateExistingStockQuantityData, UpdateExistingStockQuantityVariables>;
}
export const updateExistingStockQuantityRef: UpdateExistingStockQuantityRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateExistingStockQuantity(dc: DataConnect, vars: UpdateExistingStockQuantityVariables): MutationPromise<UpdateExistingStockQuantityData, UpdateExistingStockQuantityVariables>;

interface UpdateExistingStockQuantityRef {
  ...
  (dc: DataConnect, vars: UpdateExistingStockQuantityVariables): MutationRef<UpdateExistingStockQuantityData, UpdateExistingStockQuantityVariables>;
}
export const updateExistingStockQuantityRef: UpdateExistingStockQuantityRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateExistingStockQuantityRef:
```typescript
const name = updateExistingStockQuantityRef.operationName;
console.log(name);
```

### Variables
The `UpdateExistingStockQuantity` mutation requires an argument of type `UpdateExistingStockQuantityVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateExistingStockQuantityVariables {
  id: UUIDString;
  stockQuantity: number;
}
```
### Return Type
Recall that executing the `UpdateExistingStockQuantity` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateExistingStockQuantityData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateExistingStockQuantityData {
  product_update?: Product_Key | null;
}
```
### Using `UpdateExistingStockQuantity`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateExistingStockQuantity, UpdateExistingStockQuantityVariables } from '@dataconnect/generated';

// The `UpdateExistingStockQuantity` mutation requires an argument of type `UpdateExistingStockQuantityVariables`:
const updateExistingStockQuantityVars: UpdateExistingStockQuantityVariables = {
  id: ..., 
  stockQuantity: ..., 
};

// Call the `updateExistingStockQuantity()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateExistingStockQuantity(updateExistingStockQuantityVars);
// Variables can be defined inline as well.
const { data } = await updateExistingStockQuantity({ id: ..., stockQuantity: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateExistingStockQuantity(dataConnect, updateExistingStockQuantityVars);

console.log(data.product_update);

// Or, you can use the `Promise` API.
updateExistingStockQuantity(updateExistingStockQuantityVars).then((response) => {
  const data = response.data;
  console.log(data.product_update);
});
```

### Using `UpdateExistingStockQuantity`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateExistingStockQuantityRef, UpdateExistingStockQuantityVariables } from '@dataconnect/generated';

// The `UpdateExistingStockQuantity` mutation requires an argument of type `UpdateExistingStockQuantityVariables`:
const updateExistingStockQuantityVars: UpdateExistingStockQuantityVariables = {
  id: ..., 
  stockQuantity: ..., 
};

// Call the `updateExistingStockQuantityRef()` function to get a reference to the mutation.
const ref = updateExistingStockQuantityRef(updateExistingStockQuantityVars);
// Variables can be defined inline as well.
const ref = updateExistingStockQuantityRef({ id: ..., stockQuantity: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateExistingStockQuantityRef(dataConnect, updateExistingStockQuantityVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.product_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.product_update);
});
```

