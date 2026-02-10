const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'mibodegadigital',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const addNewProductRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'AddNewProduct', inputVars);
}
addNewProductRef.operationName = 'AddNewProduct';
exports.addNewProductRef = addNewProductRef;

exports.addNewProduct = function addNewProduct(dcOrVars, vars) {
  return executeMutation(addNewProductRef(dcOrVars, vars));
};

const getProductByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetProductById', inputVars);
}
getProductByIdRef.operationName = 'GetProductById';
exports.getProductByIdRef = getProductByIdRef;

exports.getProductById = function getProductById(dcOrVars, vars) {
  return executeQuery(getProductByIdRef(dcOrVars, vars));
};

const updateExistingStockQuantityRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateExistingStockQuantity', inputVars);
}
updateExistingStockQuantityRef.operationName = 'UpdateExistingStockQuantity';
exports.updateExistingStockQuantityRef = updateExistingStockQuantityRef;

exports.updateExistingStockQuantity = function updateExistingStockQuantity(dcOrVars, vars) {
  return executeMutation(updateExistingStockQuantityRef(dcOrVars, vars));
};

const listAllProductsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListAllProducts');
}
listAllProductsRef.operationName = 'ListAllProducts';
exports.listAllProductsRef = listAllProductsRef;

exports.listAllProducts = function listAllProducts(dc) {
  return executeQuery(listAllProductsRef(dc));
};
