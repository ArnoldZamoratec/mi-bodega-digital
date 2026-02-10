import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'mibodegadigital',
  location: 'us-east4'
};

export const addNewProductRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'AddNewProduct', inputVars);
}
addNewProductRef.operationName = 'AddNewProduct';

export function addNewProduct(dcOrVars, vars) {
  return executeMutation(addNewProductRef(dcOrVars, vars));
}

export const getProductByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetProductById', inputVars);
}
getProductByIdRef.operationName = 'GetProductById';

export function getProductById(dcOrVars, vars) {
  return executeQuery(getProductByIdRef(dcOrVars, vars));
}

export const updateExistingStockQuantityRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateExistingStockQuantity', inputVars);
}
updateExistingStockQuantityRef.operationName = 'UpdateExistingStockQuantity';

export function updateExistingStockQuantity(dcOrVars, vars) {
  return executeMutation(updateExistingStockQuantityRef(dcOrVars, vars));
}

export const listAllProductsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListAllProducts');
}
listAllProductsRef.operationName = 'ListAllProducts';

export function listAllProducts(dc) {
  return executeQuery(listAllProductsRef(dc));
}

