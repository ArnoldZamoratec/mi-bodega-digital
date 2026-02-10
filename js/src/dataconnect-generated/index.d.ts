import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface AddNewProductData {
  product_insert: Product_Key;
}

export interface AddNewProductVariables {
  barcode?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  name: string;
  price: number;
  stockQuantity: number;
}

export interface Customer_Key {
  id: UUIDString;
  __typename?: 'Customer_Key';
}

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

export interface GetProductByIdVariables {
  id: UUIDString;
}

export interface InventoryReceipt_Key {
  supplierId: UUIDString;
  productId: UUIDString;
  receiptDate: TimestampString;
  __typename?: 'InventoryReceipt_Key';
}

export interface ListAllProductsData {
  products: ({
    id: UUIDString;
    name: string;
    price: number;
    stockQuantity: number;
  } & Product_Key)[];
}

export interface Product_Key {
  id: UUIDString;
  __typename?: 'Product_Key';
}

export interface SaleItem_Key {
  saleId: UUIDString;
  productId: UUIDString;
  __typename?: 'SaleItem_Key';
}

export interface Sale_Key {
  id: UUIDString;
  __typename?: 'Sale_Key';
}

export interface Supplier_Key {
  id: UUIDString;
  __typename?: 'Supplier_Key';
}

export interface UpdateExistingStockQuantityData {
  product_update?: Product_Key | null;
}

export interface UpdateExistingStockQuantityVariables {
  id: UUIDString;
  stockQuantity: number;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface AddNewProductRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddNewProductVariables): MutationRef<AddNewProductData, AddNewProductVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: AddNewProductVariables): MutationRef<AddNewProductData, AddNewProductVariables>;
  operationName: string;
}
export const addNewProductRef: AddNewProductRef;

export function addNewProduct(vars: AddNewProductVariables): MutationPromise<AddNewProductData, AddNewProductVariables>;
export function addNewProduct(dc: DataConnect, vars: AddNewProductVariables): MutationPromise<AddNewProductData, AddNewProductVariables>;

interface GetProductByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetProductByIdVariables): QueryRef<GetProductByIdData, GetProductByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetProductByIdVariables): QueryRef<GetProductByIdData, GetProductByIdVariables>;
  operationName: string;
}
export const getProductByIdRef: GetProductByIdRef;

export function getProductById(vars: GetProductByIdVariables): QueryPromise<GetProductByIdData, GetProductByIdVariables>;
export function getProductById(dc: DataConnect, vars: GetProductByIdVariables): QueryPromise<GetProductByIdData, GetProductByIdVariables>;

interface UpdateExistingStockQuantityRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateExistingStockQuantityVariables): MutationRef<UpdateExistingStockQuantityData, UpdateExistingStockQuantityVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateExistingStockQuantityVariables): MutationRef<UpdateExistingStockQuantityData, UpdateExistingStockQuantityVariables>;
  operationName: string;
}
export const updateExistingStockQuantityRef: UpdateExistingStockQuantityRef;

export function updateExistingStockQuantity(vars: UpdateExistingStockQuantityVariables): MutationPromise<UpdateExistingStockQuantityData, UpdateExistingStockQuantityVariables>;
export function updateExistingStockQuantity(dc: DataConnect, vars: UpdateExistingStockQuantityVariables): MutationPromise<UpdateExistingStockQuantityData, UpdateExistingStockQuantityVariables>;

interface ListAllProductsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListAllProductsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListAllProductsData, undefined>;
  operationName: string;
}
export const listAllProductsRef: ListAllProductsRef;

export function listAllProducts(): QueryPromise<ListAllProductsData, undefined>;
export function listAllProducts(dc: DataConnect): QueryPromise<ListAllProductsData, undefined>;

