import prisma from '../lib/prisma.js';
import { reviewPersonLinks, savePersonLinks, reversePersonLinks, createPersonProfile } from '../services/financialPersonService.js';
const handle=run=>async(req,res,dependencies={})=>{
  try{return res.json(await run(dependencies.prismaClient||prisma,req));}
  catch(error){return res.status(error.statusCode||500).json({error:error.code,message:error.statusCode?error.message:'No fue posible guardar la vinculación. Actualiza e inténtalo de nuevo.'});}
};
export const personReviewHandler=handle((db,req)=>reviewPersonLinks(db,req.params.id,req.user));
export const personLinkHandler=handle((db,req)=>savePersonLinks(db,req.params.id,req.body,req.user));
export const personReverseHandler=handle((db,req)=>reversePersonLinks(db,req.params.id,req.body,req.user));
export const personCreateHandler=handle((db,req)=>createPersonProfile(db,req.body.selection,req.user));
